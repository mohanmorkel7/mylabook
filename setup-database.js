#!/usr/bin/env node

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Database configuration from environment variables
const pool = new Pool({
  user: process.env.PG_USER || "postgres",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DB || "crm_dev",
  password: process.env.PG_PASSWORD || "password",
  port: Number(process.env.PG_PORT) || 5432,
  ssl: false,
});

async function setupDatabase() {
  console.log("🔧 Setting up database...");
  console.log(
    `Connecting to: ${process.env.PG_HOST || "localhost"}:${Number(process.env.PG_PORT) || 5432}`,
  );
  console.log(`Database: ${process.env.PG_DB || "crm_dev"}`);
  console.log(`User: ${process.env.PG_USER || "postgres"}`);

  try {
    // Test connection
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Check if schema exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log("📋 Initializing database schema...");

      // Read and execute complete schema
      const schemaPath = path.join(
        __dirname,
        "server/database/complete-schema.sql",
      );
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, "utf8");
        await client.query(schema);
        console.log("✅ Main schema initialized");
      }

      // Initialize VC schema
      const vcSchemaPath = path.join(
        __dirname,
        "server/database/vc-schema.sql",
      );
      if (fs.existsSync(vcSchemaPath)) {
        const vcSchema = fs.readFileSync(vcSchemaPath, "utf8");
        await client.query(vcSchema);
        console.log("✅ VC schema initialized");
      }

      // Run migrations
      console.log("🔄 Running migrations...");
      const migrationFiles = [
        "migration-fix-notifications-activity.sql",
        "migration-add-partial-save-support.sql",
        "migration-add-template-id-to-leads.sql",
        "migration-follow-ups.sql",
        "migration-add-activity-ip-columns.sql",
      ];

      for (const migrationFile of migrationFiles) {
        const migrationPath = path.join(
          __dirname,
          "server/database",
          migrationFile,
        );
        if (fs.existsSync(migrationPath)) {
          try {
            const migration = fs.readFileSync(migrationPath, "utf8");
            await client.query(migration);
            console.log(`✅ Migration applied: ${migrationFile}`);
          } catch (migrationError) {
            console.log(
              `⚠️  Migration already applied or error: ${migrationFile} - ${migrationError.message}`,
            );
          }
        }
      }

      console.log("🎉 Database setup completed successfully!");
    } else {
      console.log("✅ Database schema already exists");
    }

    // Insert some sample data if tables are empty
    console.log("🔍 Checking for sample data...");
    const userCount = await client.query("SELECT COUNT(*) FROM users");
    if (parseInt(userCount.rows[0].count) === 0) {
      console.log("📝 Inserting sample data...");

      // Insert sample users
      await client.query(`
        INSERT INTO users (id, first_name, last_name, email, role, department, is_active, created_at)
        VALUES 
        (1, 'John', 'Doe', 'john@company.com', 'admin', 'IT', true, NOW()),
        (2, 'Jane', 'Smith', 'jane@company.com', 'sales', 'Sales', true, NOW()),
        (3, 'Mike', 'Johnson', 'mike@company.com', 'product', 'Product', true, NOW()),
        (4, 'Emily', 'Davis', 'emily@company.com', 'admin', 'Finance', true, NOW()),
        (5, 'David', 'Kim', 'david@company.com', 'sales', 'Sales', true, NOW())
        ON CONFLICT (id) DO NOTHING;
      `);

      // Insert sample clients
      await client.query(`
        INSERT INTO clients (id, client_name, contact_email, contact_phone, address, created_at)
        VALUES 
        (1, 'TechCorp Solutions', 'contact@techcorp.com', '+1-555-0123', 'Silicon Valley, CA', NOW()),
        (2, 'RetailMax Inc', 'info@retailmax.com', '+1-555-0456', 'New York, NY', NOW()),
        (3, 'FinanceFirst Bank', 'contact@financefirst.com', '+1-555-0789', 'Boston, MA', NOW())
        ON CONFLICT (id) DO NOTHING;
      `);

      console.log("✅ Sample data inserted");
    } else {
      console.log("✅ Sample data already exists");
    }

    client.release();
    console.log("🎯 Database is ready for real-time data!");
  } catch (error) {
    console.error("❌ Database setup failed:", error.message);
    console.log("💡 Make sure PostgreSQL is running and accessible");
    console.log(
      "💡 You can install PostgreSQL locally or use a cloud database service",
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup
setupDatabase().catch(console.error);
