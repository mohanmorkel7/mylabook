const pkg = require("pg");
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER || "crmuser",
  host: process.env.DB_HOST || "127.0.0.1",
  database: process.env.DB_NAME || "crm_test",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  password: process.env.DB_PASSWORD || undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("[backfill_rule_buckets] Starting backfill");

    const configsRes = await client.query(
      `SELECT id, team_id, bucket_id, sources FROM mail_configs WHERE sources IS NOT NULL AND bucket_id IS NULL`,
    );

    console.log(
      `[backfill_rule_buckets] Found ${configsRes.rows.length} mail_configs to inspect`,
    );

    for (const cfg of configsRes.rows) {
      const { id: configId, team_id: teamId, sources } = cfg;
      if (!sources) continue;

      let parsedSources = sources;
      if (typeof sources === "string") {
        try {
          parsedSources = JSON.parse(sources);
        } catch (e) {
          console.warn(
            `[backfill_rule_buckets] Skipping config ${configId}: failed to parse sources JSON`,
            e.message || e,
          );
          continue;
        }
      }

      // Find first rule-level bucket in any source
      let bucketName = null;
      if (Array.isArray(parsedSources)) {
        for (const s of parsedSources) {
          if (!s || !s.emailRules) continue;
          for (const r of s.emailRules) {
            if (r && r.bucket && String(r.bucket).trim() !== "") {
              bucketName = String(r.bucket).trim();
              break;
            }
          }
          if (bucketName) break;
        }
      }

      if (!bucketName) {
        console.log(
          `[backfill_rule_buckets] No rule-level bucket found for mail_config ${configId}`,
        );
        continue;
      }

      // Resolve bucket id
      let bucketId = null;
      try {
        let res;
        if (teamId) {
          res = await client.query(
            "SELECT id FROM ticket_buckets WHERE LOWER(name) = LOWER($1) AND team_id = $2 LIMIT 1",
            [bucketName, teamId],
          );
        }
        if (!res || res.rows.length === 0) {
          res = await client.query(
            "SELECT id FROM ticket_buckets WHERE LOWER(name) = LOWER($1) LIMIT 1",
            [bucketName],
          );
        }

        if (res.rows.length > 0) {
          bucketId = res.rows[0].id;
          console.log(
            `[backfill_rule_buckets] Resolved bucket '${bucketName}' -> id=${bucketId} for config ${configId}`,
          );
        } else if (teamId) {
          // Create bucket for team
          const ins = await client.query(
            "INSERT INTO ticket_buckets (team_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
            [teamId, bucketName, null],
          );
          if (ins.rows.length > 0) {
            bucketId = ins.rows[0].id;
            console.log(
              `[backfill_rule_buckets] Created bucket '${bucketName}' (id=${bucketId}) for team_id=${teamId} (config ${configId})`,
            );
          }
        } else {
          console.warn(
            `[backfill_rule_buckets] Could not resolve or create bucket '${bucketName}' for config ${configId} (no team_id)`,
          );
        }
      } catch (e) {
        console.error(
          `[backfill_rule_buckets] Error resolving/creating bucket '${bucketName}' for config ${configId}:`,
          e.message || e,
        );
        continue;
      }

      if (!bucketId) continue;

      // Update tickets that were created from this mail_config and have null bucket_id
      try {
        const updateTickets = await client.query(
          "UPDATE tickets SET bucket_id = $1 WHERE mail_config_id = $2 AND bucket_id IS NULL RETURNING id",
          [bucketId, configId],
        );
        console.log(
          `[backfill_rule_buckets] Updated ${updateTickets.rowCount} tickets for mail_config ${configId} -> bucket_id=${bucketId}`,
        );
      } catch (e) {
        console.error(
          `[backfill_rule_buckets] Failed to update tickets for config ${configId}:`,
          e.message || e,
        );
      }

      // Optionally update mail_configs.bucket_id so future tickets default to this bucket
      try {
        const updCfg = await client.query(
          "UPDATE mail_configs SET bucket_id = $1 WHERE id = $2 AND (bucket_id IS NULL OR bucket_id = 0) RETURNING id",
          [bucketId, configId],
        );
        if (updCfg.rowCount > 0) {
          console.log(
            `[backfill_rule_buckets] Set mail_configs(${configId}).bucket_id = ${bucketId}`,
          );
        }
      } catch (e) {
        console.warn(
          `[backfill_rule_buckets] Failed to update mail_configs.bucket_id for ${configId}:`,
          e.message || e,
        );
      }
    }

    console.log("[backfill_rule_buckets] Backfill complete");
  } catch (error) {
    console.error(
      "[backfill_rule_buckets] Fatal error:",
      error.message || error,
    );
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
