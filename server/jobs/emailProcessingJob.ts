import cron from "node-cron";
import {
  getAllActiveConfigs,
  processEmailsForConfigs,
  getTodayEmails,
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
      "* * * * *",
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
              const since = config.last_processed_at ? new Date(config.last_processed_at) : undefined;

              console.log(
                `Processing config ${config.id} ("${config.name}") ${since ? `since ${since.toISOString()}` : "from beginning of today"}`,
              );

              // Fetch emails since last processing for this config
              const emails = await getTodayEmails(since);
              if (!emails || emails.length === 0) {
                console.log(`No new emails found for config ${config.id}, skipping`);
                // Still update the timestamp to mark we checked
                await MailConfigRepository.updateLastProcessedAt(config.id);
                continue;
              }

              console.log(`Found ${emails.length} emails for config ${config.id}`);

              // Filter and process emails for this specific config
              const matchedEmails = emails.filter((email: any) => {
                try {
                  return matchEmailAgainstConfig(email, config as any);
                } catch (e) {
                  return false;
                }
              });

              if (matchedEmails.length === 0) {
                console.log(`No matching emails for config ${config.id}, updating timestamp`);
                // Update timestamp even if no matches
                await MailConfigRepository.updateLastProcessedAt(config.id);
                continue;
              }

              console.log(
                `✅ Config ${config.id} ("${config.name}") matched ${matchedEmails.length} email(s)`,
              );

              // Process matched emails
              const result = await processEmailsForConfigs(matchedEmails, [config as any]);
              console.log(`Config ${config.id} processing result:`, result);

              // Update the last_processed_at timestamp after successful processing
              await MailConfigRepository.updateLastProcessedAt(config.id);
            } catch (configError) {
              console.error(
                `Error processing config ${config.id}:`,
                (configError as any)?.message || configError,
              );
            }
          }

          // For debugging: filter emails for each config and log matches
          try {
            console.log(
              `Found ${emails.length} emails today. Running config filters (${configs.length} configs)...`,
            );
            for (const cfg of configs) {
              try {
                const matches = emails.filter((email: any) => {
                  try {
                    return matchEmailAgainstConfig(email, cfg as any);
                  } catch (e) {
                    return false;
                  }
                });

                if (matches.length > 0) {
                  console.log(
                    `✅ Config ${cfg.id} ("${cfg.name}") [${cfg.field_type}="${cfg.field_value}"] matched ${matches.length} email(s):`,
                  );
                  for (const m of matches) {
                    const isFromReconops = m.from
                      .toLowerCase()
                      .includes("reconops@mindeed.in");
                    const marker = isFromReconops ? "🔔 RECONOPS" : "📧 OTHER";
                    console.log(
                      `   ${marker} - subject="${m.subject || "(no subject)"}" from=${m.from}`,
                    );
                  }
                } else {
                  console.log(
                    `❌ Config ${cfg.id} ("${cfg.name}") [${cfg.field_type}="${cfg.field_value}"] matched 0 emails.`,
                  );
                }
              } catch (inner) {
                console.error(
                  `Error filtering emails for config ${cfg.id}:`,
                  (inner as any)?.message || inner,
                );
              }
            }
          } catch (logErr) {
            console.error(
              "Error while logging config matches:",
              (logErr as any)?.message || logErr,
            );
          }

          const result = await processEmailsForConfigs(emails, configs);
          console.log("Email processing job result:", result);
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
