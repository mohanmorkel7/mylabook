import cron from "node-cron";
import {
  getAllActiveConfigs,
  processEmailsForConfigs,
  getTodayEmails,
} from "../services/emailProcessorService";
import { matchEmailAgainstConfig } from "../services/emailMatchingService";

export function initialize() {
  try {
    // Skip in environments where cron jobs are not desired
    if (process.env.DISABLE_EMAIL_PROCESSING_JOB === "true") {
      console.log("Email processing job disabled via environment variable");
      return;
    }

    // Schedule job to run every minute
    cron.schedule(
      "*/5 * * * *",
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

          // Fetch today's emails (integration point) - getTodayEmails returns Email[]
          const emails = await getTodayEmails();
          if (!emails || emails.length === 0) {
            console.log("No emails found for today, skipping");
            return;
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
                    `Config ${cfg.id} ("${cfg.name}") matched ${matches.length} email(s):`,
                  );
                  for (const m of matches) {
                    console.log(
                      ` - emailId=${m.id} subject="${m.subject || "(no subject)"}" from=${m.from || m.sender || "unknown"}`,
                    );
                  }
                } else {
                  console.log(
                    `Config ${cfg.id} ("${cfg.name}") matched 0 emails.`,
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
