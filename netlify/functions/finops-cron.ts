import type { Handler } from "@netlify/functions";
import { Handler } from "@netlify/functions";
import finopsAlertService from "../../server/services/finopsAlertService";
import { initializeDatabase } from "../../server/database/connection";

export const handler: Handler = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[finops-cron] START ${startedAt}`);
  try {
    try {
      await initializeDatabase();
      console.log("[finops-cron] Database initialized");
    } catch (dbErr: any) {
      console.warn(
        "[finops-cron] Database init warning:",
        dbErr?.message || dbErr,
      );
    }

    await finopsAlertService.checkDailyTaskExecution();
    console.log("[finops-cron] checkDailyTaskExecution done");

    await finopsAlertService.checkSLAAlerts();
    console.log("[finops-cron] checkSLAAlerts done");

    if ((finopsAlertService as any).checkIncompleteSubtasks) {
      await (finopsAlertService as any).checkIncompleteSubtasks();
      console.log("[finops-cron] checkIncompleteSubtasks done");
    }

    const finishedAt = new Date().toISOString();
    console.log(`[finops-cron] END ${finishedAt}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, startedAt, finishedAt }),
    };
  } catch (e: any) {
    console.error("[finops-cron] ERROR:", e?.stack || e?.message || String(e));
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  }
};
