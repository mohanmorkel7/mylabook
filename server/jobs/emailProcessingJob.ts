import cron from "node-cron";
import {
  getAllActiveConfigs,
  // processEmailsForConfigs,
  getTodayEmails,
  EmailProcessingService,
} from "../services/emailProcessorService";
import { matchEmailAgainstConfig } from "../services/emailMatchingService";
import { MailConfigRepository } from "../models/MailConfig";

export function initialize() {
  try {
    // TEMPORARILY DISABLED: Email processing job disabled to prevent memory overflow
    // Enable by setting ENABLE_EMAIL_PROCESSING_JOB=true
    if (process.env.ENABLE_EMAIL_PROCESSING_JOB !== "true") {
      console.log("Email processing job disabled (memory management)");
      return;
    }

    // Schedule job to run every minute
    cron.schedule(
      "*/1 * * * *",
      async () => {
        console.log(
          `[${new Date().toISOString()}] Running email processing job`,
        );
        try {
          const configs = await getAllActiveConfigs();
          if (!configs || configs.length === 0) {
            console.log("No active mail configs found, skipping");
            return;
          }

          // Process each config independently with its own timestamp
          for (const config of configs) {
            try {
              const since = config.last_processed_at
                ? new Date(config.last_processed_at)
                : undefined;

              console.log(
                `Processing config ${config.id} ("${config.name}") ${since ? `since ${since.toISOString()}` : "from beginning of today"}`,
              );

              // Determine email sources for this config
              const sources = Array.isArray((config as any).sources)
                ? (config as any).sources
                : [];

              // If there are no sources defined, fallback to config-level from_email/to_email
              const emailSources: string[] = [];
              if (sources.length > 0) {
                for (const s of sources) {
                  if (s.type === "Email") {
                    const mailbox =
                      s.customEmailSource || s.emailSource || null;
                    if (mailbox) emailSources.push(mailbox);
                  }
                }
              } else {
                if ((config as any).from_email)
                  emailSources.push((config as any).from_email);
                if ((config as any).to_email)
                  emailSources.push((config as any).to_email);
              }

              if (emailSources.length === 0) {
                console.log(
                  `No email source configured for config ${config.id}, skipping`,
                );
                // Update timestamp to avoid re-checking constantly
                await MailConfigRepository.updateLastProcessedAt(config.id);
                continue;
              }

              let anyMatched = false;

              // For each email source mailbox, fetch emails and apply the config/source-specific rules
              for (const mailbox of emailSources) {
                try {
                  console.log(
                    `Fetching emails for config ${config.id} from mailbox ${mailbox}`,
                  );
                  const emails = await getTodayEmails(since, mailbox);

                  if (!emails || emails.length === 0) {
                    console.log(
                      `No new emails found in mailbox ${mailbox} for config ${config.id}`,
                    );
                    continue;
                  }

                  console.log(
                    `Found ${emails.length} emails in ${mailbox} for config ${config.id}`,
                  );

                  // Filter emails using config rules; restrict matching to the current source if available
                  let sourceForMatching = undefined;
                  if (Array.isArray((config as any).sources)) {
                    sourceForMatching = (config as any).sources.find(
                      (s: any) => {
                        const candidate =
                          s.customEmailSource || s.emailSource || null;
                        return (
                          candidate &&
                          candidate.toLowerCase() === mailbox.toLowerCase()
                        );
                      },
                    );
                  }

                  const configToUse = sourceForMatching
                    ? { ...config, sources: [sourceForMatching] }
                    : config;

                  // Debug: log one sample email and the source's rules to help diagnose matching failures
                  try {
                    const debugSample = emails[0];
                    const rules = sourceForMatching ? (sourceForMatching.emailRules || []) : (configToUse.sources && configToUse.sources.length ? configToUse.sources[0].emailRules || [] : []);
                    console.log(`Email matching debug: sampleEmailId=${debugSample.id} subject="${(debugSample.subject||"").substring(0,120)}" from="${(debugSample.from||"").substring(0,80)}" sourceMailbox=${mailbox} rules=${JSON.stringify(rules)}`);
                  } catch (dbg) {
                    // ignore
                  }

                  const matchedEmails = emails.filter((email: any) => {
                    try {
                      return matchEmailAgainstConfig(email, configToUse as any);
                    } catch (e) {
                      return false;
                    }
                  });

                  if (matchedEmails.length === 0) {
                    console.log(
                      `No matching emails in mailbox ${mailbox} for config ${config.id}`,
                    );
                    continue;
                  }

                  anyMatched = true;
                  console.log(
                    `✅ Config ${config.id} ("${config.name}") matched ${matchedEmails.length} email(s) in ${mailbox}`,
                  );

                  // Process matched emails sequentially to create tickets and log atomically
                  for (const email of matchedEmails) {
                    try {
                      // Skip if already processed
                      const already =
                        await MailConfigRepository.isEmailProcessed(
                          config.id,
                          email.id,
                        );
                      if (already) {
                        console.log(
                          `Email ${email.id} already processed for config ${config.id}, skipping`,
                        );
                        continue;
                      }

                      const ticketResult =
                        await EmailProcessingService.createTicket(
                          email,
                          config as any,
                        );

                      // Attempt to atomically log processing result. If another process logged first,
                      // this will return false and we ignore counting.
                      const logged =
                        await MailConfigRepository.logProcessedEmailAtomic(
                          config.id,
                          email.id,
                          email.subject || "(No subject)",
                          (email.from &&
                            (email.from.emailAddress?.address || email.from)) ||
                            (email.sender &&
                              email.sender.emailAddress?.address) ||
                            "unknown",
                          ticketResult.ticketId,
                          ticketResult.success ? "success" : "failed",
                          ticketResult.error,
                        );

                      if (logged) {
                        console.log(
                          `Processed email ${email.id} for config ${config.id}: success=${ticketResult.success}`,
                        );
                      } else {
                        console.log(
                          `Another process logged email ${email.id} for config ${config.id} first; skipping`,
                        );
                      }
                    } catch (emailErr) {
                      console.error(
                        `Error processing email ${email.id} for config ${config.id}:`,
                        (emailErr as any)?.message || emailErr,
                      );
                    }
                  }
                } catch (mailboxErr) {
                  console.error(
                    `Error fetching/processing emails from mailbox ${mailbox} for config ${config.id}:`,
                    (mailboxErr as any)?.message || mailboxErr,
                  );
                }
              }

              // Update the last_processed_at timestamp after processing this config
              await MailConfigRepository.updateLastProcessedAt(config.id);

              if (!anyMatched) {
                console.log(
                  `No emails matched for config ${config.id} across all sources`,
                );
              }
            } catch (configError) {
              console.error(
                `Error processing config ${config.id}:`,
                (configError as any)?.message || configError,
              );
            }
          }
        } catch (err) {
          console.error(
            "Error running email processing job:",
            (err as any)?.message || err,
          );
        }
      },
      {
        scheduled: true,
      },
    );

    console.log("Email processing job scheduled (every minute)");
  } catch (error) {
    console.error(
      "Failed to initialize email processing job:",
      (error as any)?.message || error,
    );
  }
}
