const { Pool } = require("pg");

// Use your local database connection settings
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "lead_management", // Replace with your actual database name
  password: "admin123", // Replace with your actual password
  port: 5432,
});

async function debugLocalDatabaseContacts() {
  console.log("🔍 DEBUGGING LOCAL DATABASE CONTACT ISSUES");
  console.log("==========================================\n");

  try {
    // Test database connection
    console.log("📡 Testing database connection...");
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected successfully\n");

    // Check if leads table exists
    console.log("📋 Checking leads table structure...");
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'leads'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log("❌ Leads table does not exist");
      return;
    }

    // Check contacts column type
    const columnInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'leads' 
      AND column_name = 'contacts'
    `);

    if (columnInfo.rows.length === 0) {
      console.log("❌ Contacts column does not exist in leads table");
      return;
    }

    console.log("✅ Contacts column info:");
    console.log(`   Type: ${columnInfo.rows[0].data_type}`);
    console.log(`   Nullable: ${columnInfo.rows[0].is_nullable}\n`);

    // Get sample leads with raw contacts data
    console.log("📊 Sample leads with contacts data:");
    const leads = await pool.query(`
      SELECT id, client_name, contacts,
             pg_typeof(contacts) as contacts_type
      FROM leads 
      LIMIT 5
    `);

    if (leads.rows.length === 0) {
      console.log("❌ No leads found in database");
      return;
    }

    leads.rows.forEach((lead, idx) => {
      console.log(`\n${idx + 1}. Lead ${lead.id}: "${lead.client_name}"`);
      console.log(`   Contacts type: ${lead.contacts_type}`);
      console.log(`   Contacts value:`, lead.contacts);
      console.log(`   Contacts is array:`, Array.isArray(lead.contacts));
      console.log(
        `   Contacts length:`,
        lead.contacts ? lead.contacts.length : "N/A",
      );

      if (lead.contacts && lead.contacts.length > 0) {
        const firstContact = lead.contacts[0];
        console.log(`   First contact:`, firstContact);
        console.log(`   Contact name:`, firstContact.contact_name || "MISSING");
        console.log(`   Contact email:`, firstContact.email || "MISSING");
        console.log(`   Contact phone:`, firstContact.phone || "MISSING");
      } else {
        console.log(`   ❌ No contacts or empty contacts array`);
      }
    });

    console.log("\n🔧 POTENTIAL FIXES:");
    console.log("===================");

    // Check for common issues
    const emptyContacts = await pool.query(`
      SELECT COUNT(*) as count
      FROM leads 
      WHERE contacts IS NULL OR contacts = '[]'::jsonb OR jsonb_array_length(contacts) = 0
    `);

    console.log(
      `\n📊 Leads with empty/null contacts: ${emptyContacts.rows[0].count}`,
    );

    // Check for string vs array issues
    const stringContacts = await pool.query(`
      SELECT COUNT(*) as count
      FROM leads 
      WHERE pg_typeof(contacts) != 'jsonb'
    `);

    console.log(
      `📊 Leads with non-JSONB contacts: ${stringContacts.rows[0].count}`,
    );

    console.log("\n💡 SUGGESTIONS:");
    console.log("1. If contacts are empty: Add contact data to your leads");
    console.log(
      "2. If contacts are strings: Convert them to proper JSONB format",
    );
    console.log(
      "3. If contacts exist but show 'Not provided': Check frontend display logic",
    );
    console.log("4. Sample contact format that should work:");
    console.log(
      `   contacts: [{"contact_name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "designation": "Manager", "linkedin": ""}]`,
    );
  } catch (error) {
    console.error("❌ Database Error:", error.message);
    console.log("\n💡 TROUBLESHOOTING:");
    console.log("1. Check if PostgreSQL is running");
    console.log("2. Verify database connection settings");
    console.log("3. Ensure the leads table exists with contacts column");
    console.log("4. Check if the database user has proper permissions");
  } finally {
    pool.end();
  }
}

debugLocalDatabaseContacts().catch(console.error);
