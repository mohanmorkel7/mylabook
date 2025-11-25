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
              const rawSince = config.last_processed_at
                ? new Date(config.last_processed_at)
                : undefined;

              // Add a small overlap buffer (30s) to avoid missing messages due to clock skew
              const since = rawSince
                ? new Date(rawSince.getTime() - 30 * 1000)
                : undefined;

              console.log(
                `Processing config ${config.id} ("${config.name}") ${since ? `since ${since.toISOString()} (buffered from ${rawSince?.toISOString()})` : "from beginning of today"}`,
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
                    // Prefer the actual emailSource (UPN/email) for mailbox access. customEmailSource
                    // is a friendly label and should not be used to call Graph unless emailSource is missing.
                    const mailbox =
                      s.emailSource || s.customEmailSource || null;
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
              let anyFetchSucceeded = false; // track whether any mailbox fetch completed successfully
              // Track the maximum receivedDateTime of emails we processed (created tickets for)
              let processedMaxDate: Date | null = null;

              // For each email source mailbox, fetch emails and apply the config/source-specific rules
              for (const mailbox of emailSources) {
                try {
                  console.log(
                    `Fetching emails for config ${config.id} from mailbox ${mailbox}`,
                  );
                  const emails = await getTodayEmails(
                    since,
                    mailbox,
                    config.id,
                  );

                  // Mark that fetch completed (even if 0 results) so we can advance last_processed_at safely
                  anyFetchSucceeded = true;

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
                          s.emailSource || s.customEmailSource || null;
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
                    const rules = sourceForMatching
                      ? sourceForMatching.emailRules || []
                      : configToUse.sources && configToUse.sources.length
                        ? configToUse.sources[0].emailRules || []
                        : [];
                    console.log(
                      `Email matching debug: sampleEmailId=${debugSample.id} subject="${(debugSample.subject || "").substring(0, 120)}" from="${(debugSample.from || "").substring(0, 80)}" sourceMailbox=${mailbox} rules=${JSON.stringify(rules)}`,
                    );
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
                      // Atomically claim the email for processing to avoid duplicate ticket creation
                      const claimed =
                        await MailConfigRepository.claimEmailProcessing(
                          config.id,
                          email.id,
                          email.subject || "(No subject)",
                          (email.from &&
                            (email.from.emailAddress?.address || email.from)) ||
                            (email.sender &&
                              email.sender.emailAddress?.address) ||
                            "unknown",
                        );

                      if (!claimed) {
                        console.log(
                          `Another process claimed/processed email ${email.id} for config ${config.id}; skipping`,
                        );
                        continue;
                      }

                      // We hold the claim — proceed to create the ticket
                      const ticketResult =
                        await EmailProcessingService.createTicket(
                          email,
                          config as any,
                        );

                      // Finalize the processing log (insert or update) with result
                      try {
                        await MailConfigRepository.logProcessedEmail(
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

                        // Best-effort: record created_tickets row if we have a ticket id
                        if (ticketResult.ticketId) {
                          try {
                            await MailConfigRepository.insertCreatedTicket(
                              config.id,
                              email.id,
                              ticketResult.ticketId,
                              null,
                              { email_body: email.body || null },
                              email.subject || "(No subject)",
                              (email.from &&
                                (email.from.emailAddress?.address ||
                                  email.from)) ||
                                (email.sender &&
                                  email.sender.emailAddress?.address) ||
                                "unknown",
                            );
                          } catch (e) {
                            console.warn(
                              "Failed to insert created_tickets after claim flow:",
                              e?.message || e,
                            );
                          }
                        }

                        console.log(
                          `Processed email ${email.id} for config ${config.id}: success=${ticketResult.success}`,
                        );
                        // Track the latest processed email time so we only advance last_processed_at when we've created tickets
                        try {
                          if (email.receivedDateTime) {
                            const dt = new Date(email.receivedDateTime);
                            if (!isNaN(dt.getTime())) {
                              if (!processedMaxDate || dt > processedMaxDate) {
                                processedMaxDate = dt;
                              }
                            }
                          }
                        } catch (e) {
                          // ignore
                        }
                      } catch (logErr) {
                        console.error(
                          `Failed to finalize processing log for email ${email.id} config ${config.id}:`,
                          (logErr as any)?.message || logErr,
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
              // Advance only if we actually processed emails (created tickets). This prevents skipping
              // messages that were fetched but not matched or processed.
              if (processedMaxDate) {
                // Only update if it's forward of the existing timestamp
                if (!rawSince || processedMaxDate > rawSince) {
                  await MailConfigRepository.updateLastProcessedAt(
                    config.id,
                    processedMaxDate,
                  );
                } else {
                  console.log(
                    `Computed processedMaxDate (${processedMaxDate.toISOString()}) is not newer than existing last_processed_at for config ${config.id}; skipping update`,
                  );
                }
              } else if (!anyFetchSucceeded) {
                console.log(
                  `Skipping update of last_processed_at for config ${config.id} because no mailbox fetch succeeded`,
                );
              } else {
                console.log(
                  `Not updating last_processed_at for config ${config.id} because no emails were processed (matched/created)`,
                );
              }

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
