import {
  getAllActiveConfigs,
  getTodayEmails,
  EmailProcessingService,
} from "../services/emailProcessorService";
import { matchEmailAgainstConfig } from "../services/emailMatchingService";
import { MailConfigRepository } from "../models/MailConfig";

// Use globalThis so clearInterval works across hot-reload restarts.
// Each call to initialize() clears the previous interval before creating a new one.
const g = globalThis as any;

async function runEmailJob() {
  try {
    const configs = await getAllActiveConfigs();
    if (!configs || configs.length === 0) return;

    for (const config of configs) {
      try {
        const rawSince = config.last_processed_at
          ? new Date(config.last_processed_at)
          : undefined;

        // 10-second overlap buffer to avoid missing messages due to clock skew
        const since = rawSince
          ? new Date(rawSince.getTime() - 10 * 1000)
          : undefined;

        console.log(
          `Processing config ${config.id} ("${config.name}") ${since ? `since ${since.toISOString()} (buffered from ${rawSince?.toISOString()})` : "from beginning of today"}`,
        );

        const sources = Array.isArray((config as any).sources)
          ? (config as any).sources
          : [];

        const emailSources: string[] = [];
        if (sources.length > 0) {
          for (const s of sources) {
            if (s.type === "Email") {
              const mailbox = s.emailSource || s.customEmailSource || null;
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
          await MailConfigRepository.updateLastProcessedAt(config.id);
          continue;
        }

        let anyMatched = false;
        let anyFetchSucceeded = false;
        let processedMaxDate: Date | null = null;
        let fetchedMaxDate: Date | null = null;

        const mailboxQueue = [...emailSources];
        const mailboxResults: Array<
          | { mailbox: string; emails?: any[] }
          | { mailbox: string; error: any }
        > = [];
        const MAX_MAILBOX_CONCURRENCY = 3;

        const worker = async () => {
          while (mailboxQueue.length > 0) {
            const mailbox = mailboxQueue.shift();
            if (!mailbox) break;
            try {
              console.log(
                `Fetching emails for config ${config.id} from mailbox ${mailbox}`,
              );
              const emails = await getTodayEmails(since, mailbox, config.id);
              console.log(
                `Found ${emails?.length || 0} emails in ${mailbox} for config ${config.id}`,
              );
              if (Array.isArray(emails)) {
                for (const e of emails) {
                  if (e.receivedDateTime) {
                    const dt = new Date(e.receivedDateTime);
                    if (!isNaN(dt.getTime())) {
                      if (!fetchedMaxDate || dt > fetchedMaxDate)
                        fetchedMaxDate = dt;
                    }
                  }
                }
              }
              mailboxResults.push({ mailbox, emails });
            } catch (error) {
              mailboxResults.push({ mailbox, error });
            }
          }
        };

        const workers = Array.from(
          { length: Math.min(MAX_MAILBOX_CONCURRENCY, emailSources.length) },
          () => worker(),
        );
        await Promise.all(workers);

        for (const result of mailboxResults) {
          if ("error" in result) {
            console.error(
              `Error fetching/processing emails from mailbox ${result.mailbox} for config ${config.id}:`,
              result.error?.message || result.error,
            );
            continue;
          }

          const { mailbox, emails } = result;
          anyFetchSucceeded = true;

          if (!emails || emails.length === 0) {
            console.log(
              `No new emails found in mailbox ${mailbox} for config ${config.id}`,
            );
            continue;
          }

          let sourceForMatching: any = undefined;
          if (Array.isArray((config as any).sources)) {
            sourceForMatching = (config as any).sources.find((s: any) => {
              const candidate = s.emailSource || s.customEmailSource || null;
              return (
                candidate &&
                candidate.toLowerCase() === mailbox.toLowerCase()
              );
            });
          }

          const configToUse = sourceForMatching
            ? { ...config, sources: [sourceForMatching] }
            : config;

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
          } catch (_) {}

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

          for (const email of matchedEmails) {
            try {
              const claimed = await MailConfigRepository.claimEmailProcessing(
                config.id,
                email.id,
                email.subject || "(No subject)",
                (email.from &&
                  (email.from.emailAddress?.address || email.from)) ||
                  (email.sender && email.sender.emailAddress?.address) ||
                  "unknown",
              );

              if (!claimed) {
                console.log(
                  `Another process claimed/processed email ${email.id} for config ${config.id}; skipping`,
                );
                continue;
              }

              const ticketResult = await EmailProcessingService.createTicket(
                email,
                config as any,
              );

              try {
                await MailConfigRepository.logProcessedEmail(
                  config.id,
                  email.id,
                  email.subject || "(No subject)",
                  (email.from &&
                    (email.from.emailAddress?.address || email.from)) ||
                    (email.sender && email.sender.emailAddress?.address) ||
                    "unknown",
                  ticketResult.ticketId,
                  ticketResult.success ? "success" : "failed",
                  ticketResult.error,
                );

                if (ticketResult.ticketId) {
                  try {
                    const rawEmailBodyJob = ticketResult.emailBody ?? null;
                    let normalizedEmailBodyJob: string | null = null;
                    if (typeof rawEmailBodyJob === "string")
                      normalizedEmailBodyJob = rawEmailBodyJob;
                    else if (rawEmailBodyJob == null) {
                      if (
                        email.body &&
                        typeof email.body === "object" &&
                        typeof (email.body as any).content === "string"
                      ) {
                        normalizedEmailBodyJob = (email.body as any).content;
                      } else if (typeof email.body === "string") {
                        normalizedEmailBodyJob = email.body;
                      } else if (typeof email.bodyPreview === "string") {
                        normalizedEmailBodyJob = email.bodyPreview;
                      }
                    } else {
                      try {
                        normalizedEmailBodyJob = String(rawEmailBodyJob);
                      } catch (_) {}
                    }

                    await MailConfigRepository.insertCreatedTicket(
                      config.id,
                      email.id,
                      ticketResult.ticketId,
                      null,
                      { email_body: normalizedEmailBodyJob },
                      email.subject || "(No subject)",
                      (email.from &&
                        (email.from.emailAddress?.address || email.from)) ||
                        (email.sender && email.sender.emailAddress?.address) ||
                        "unknown",
                    );
                  } catch (e: any) {
                    console.warn(
                      "Failed to insert created_tickets:",
                      e?.message || e,
                    );
                  }
                }

                console.log(
                  `Processed email ${email.id} for config ${config.id}: success=${ticketResult.success}`,
                );
                if (email.receivedDateTime) {
                  const dt = new Date(email.receivedDateTime);
                  if (!isNaN(dt.getTime())) {
                    if (!processedMaxDate || dt > processedMaxDate)
                      processedMaxDate = dt;
                  }
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
        }

        if (processedMaxDate) {
          if (!rawSince || processedMaxDate > rawSince) {
            await MailConfigRepository.updateLastProcessedAt(
              config.id,
              processedMaxDate,
            );
          }
        } else if (fetchedMaxDate) {
          if (!rawSince || fetchedMaxDate > rawSince) {
            console.log(
              `Advancing last_processed_at for config ${config.id} to fetchedMaxDate ${fetchedMaxDate.toISOString()} (no matches created)`,
            );
            await MailConfigRepository.updateLastProcessedAt(
              config.id,
              fetchedMaxDate,
            );
          }
        } else if (!anyFetchSucceeded) {
          console.log(
            `Skipping update of last_processed_at for config ${config.id} because no mailbox fetch succeeded`,
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
}

export function initialize() {
  try {
    if (process.env.ENABLE_EMAIL_PROCESSING_JOB !== "true") {
      console.log(
        "Email processing job disabled. Set ENABLE_EMAIL_PROCESSING_JOB=true to enable.",
      );
      return;
    }

    // Clear any previous interval (works across hot-reload since clearInterval is process-global)
    if (g.__emailJobInterval) {
      clearInterval(g.__emailJobInterval);
      g.__emailJobInterval = null;
      console.log("Email processing job: cleared previous interval");
    }
    // Reset running flag in case a previous run crashed before cleanup
    g.__emailJobRunning = false;

    // Run once immediately (after a short delay to let DB settle), then every 30 seconds
    const runIfIdle = async () => {
      if (g.__emailJobRunning === true) {
        console.log(
          `[${new Date().toISOString()}] Email processing job skipped (previous run still in progress)`,
        );
        return;
      }
      g.__emailJobRunning = true;
      console.log(`[${new Date().toISOString()}] Running email processing job`);
      try {
        await runEmailJob();
      } finally {
        g.__emailJobRunning = false;
      }
    };

    // Start interval — setInterval ID is process-global and survives hot-reload
    g.__emailJobInterval = setInterval(runIfIdle, 30_000);
    console.log("Email processing job scheduled (every 30 seconds via setInterval)");
  } catch (error) {
    console.error(
      "Failed to initialize email processing job:",
      (error as any)?.message || error,
    );
  }
}
