import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER || 'crmuser',
  host: process.env.DB_HOST || '10.30.11.95',
  database: process.env.DB_NAME || 'crm_test',
  port: process.env.DB_PORT || 2019,
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting migration: add last_processed_at to mail_configs...');

    // Add column if not exists
    await client.query(`
      ALTER TABLE mail_configs
      ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMP DEFAULT NULL;
    `);
    console.log('✅ Added last_processed_at column');

    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mail_configs_last_processed ON mail_configs(last_processed_at);
    `);
    console.log('✅ Created index on last_processed_at');

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
