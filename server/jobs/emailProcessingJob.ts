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

    // Schedule job to run every 5 minutes
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

    console.log("Email processing job scheduled (every 5 minutes)");
  } catch (error) {
    console.error(
      "Failed to initialize email processing job:",
      (error as any)?.message || error,
    );
  }
}
