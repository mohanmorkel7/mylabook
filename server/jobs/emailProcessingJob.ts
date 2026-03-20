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
    // Gate the email processing job behind an environment variable to avoid
    // running it in local dev by default (it may reach external mail servers
    // and cause blocking I/O, timeouts, or excessive CPU/memory usage).
    if (process.env.ENABLE_EMAIL_PROCESSING_JOB !== "true") {
      console.log(
        "Email processing job disabled by default. Set ENABLE_EMAIL_PROCESSING_JOB=true to enable.",
      );
      return;
    }

    // Schedule job to run every 30 seconds
    cron.schedule(
      "*/30 * * * * *",
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

              // Add a small overlap buffer (10s) to avoid missing messages due to clock skew
              const since = rawSince
                ? new Date(rawSince.getTime() - 10 * 1000)
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
              // Track the maximum receivedDateTime across all fetched emails (even if not matched)
              let fetchedMaxDate: Date | null = null;

              // Fetch emails for all sources with a small concurrency cap to avoid OOMs.
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
                    const emails = await getTodayEmails(
                      since,
                      mailbox,
                      config.id,
                    );
                    console.log(
                      `Found ${emails?.length || 0} emails in ${mailbox} for config ${config.id}`,
                    );
                    if (Array.isArray(emails)) {
                      for (const e of emails) {
                        try {
                          if (e.receivedDateTime) {
                            const dt = new Date(e.receivedDateTime);
                            if (!isNaN(dt.getTime())) {
                              if (!fetchedMaxDate || dt > fetchedMaxDate) {
                                fetchedMaxDate = dt;
                              }
                            }
                          }
                        } catch (innerErr) {
                          // ignore malformed date
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

                let sourceForMatching = undefined;
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

                for (const email of matchedEmails) {
                  try {
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

                    const ticketResult =
                      await EmailProcessingService.createTicket(
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
                          (email.sender &&
                            email.sender.emailAddress?.address) ||
                          "unknown",
                        ticketResult.ticketId,
                        ticketResult.success ? "success" : "failed",
                        ticketResult.error,
                      );

                      if (ticketResult.ticketId) {
                        try {
                          const rawEmailBodyJob =
                            ticketResult.emailBody ?? null;
                          let normalizedEmailBodyJob: string | null = null;
                          if (typeof rawEmailBodyJob === "string")
                            normalizedEmailBodyJob = rawEmailBodyJob;
                          else if (rawEmailBodyJob == null) {
                            if (
                              email.body &&
                              typeof email.body === "object" &&
                              typeof (email.body as any).content === "string"
                            ) {
                              normalizedEmailBodyJob = (email.body as any)
                                .content;
                            } else if (typeof email.body === "string") {
                              normalizedEmailBodyJob = email.body;
                            } else if (
                              typeof email.bodyPreview === "string"
                            ) {
                              normalizedEmailBodyJob = email.bodyPreview;
                            } else {
                              normalizedEmailBodyJob = null;
                            }
                          } else {
                            try {
                              normalizedEmailBodyJob =
                                String(rawEmailBodyJob);
                            } catch (e) {
                              normalizedEmailBodyJob = null;
                            }
                          }

                          await MailConfigRepository.insertCreatedTicket(
                            config.id,
                            email.id,
                            ticketResult.ticketId,
                            null,
                            { email_body: normalizedEmailBodyJob },
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
              } else if (fetchedMaxDate) {
                // No tickets were created/processed, but we did fetch emails — advance last_processed_at
                if (!rawSince || fetchedMaxDate > rawSince) {
                  console.log(
                    `Advancing last_processed_at for config ${config.id} to fetchedMaxDate ${fetchedMaxDate.toISOString()} (no matches created)`,
                  );
                  await MailConfigRepository.updateLastProcessedAt(
                    config.id,
                    fetchedMaxDate,
                  );
                } else {
                  console.log(
                    `FetchedMaxDate (${fetchedMaxDate.toISOString()}) is not newer than existing last_processed_at for config ${config.id}; skipping update`,
                  );
                }
              } else if (!anyFetchSucceeded) {
                console.log(
                  `Skipping update of last_processed_at for config ${config.id} because no mailbox fetch succeeded`,
                );
              } else {
                console.log(
                  `Not updating last_processed_at for config ${config.id} because no emails were processed (matched/created) and no fetched date available`,
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

    console.log("Email processing job scheduled (every 30 seconds)");
  } catch (error) {
    console.error(
      "Failed to initialize email processing job:",
      (error as any)?.message || error,
    );
  }
}
