const { Pool } = require("pg");

// Use your local database connection settings
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "lead_management", // Replace with your actual database name
  password: "admin123", // Replace with your actual password
  port: 5432,
});

async function fixLocalContactsData() {
  console.log("🔧 FIXING LOCAL DATABASE CONTACTS DATA");
  console.log("======================================\n");

  try {
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected\n");

    // First, let's add some sample contact data to leads that don't have any
    console.log(
      "📋 STEP 1: Adding sample contacts to leads without contact data",
    );

    const leadsWithoutContacts = await pool.query(`
      SELECT id, client_name, company
      FROM leads 
      WHERE contacts IS NULL 
         OR contacts = '[]'::jsonb 
         OR jsonb_array_length(contacts) = 0
      LIMIT 10
    `);

    console.log(
      `Found ${leadsWithoutContacts.rows.length} leads without contact data`,
    );

    for (const lead of leadsWithoutContacts.rows) {
      // Create sample contact data based on the company name
      const companyName =
        lead.company || lead.client_name || `Company ${lead.id}`;
      const contactName = `Contact Person ${lead.id}`;
      const email = `contact${lead.id}@${companyName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
      const phone = `+1 (555) ${Math.random().toString().substr(2, 3)}-${Math.random().toString().substr(2, 4)}`;

      const sampleContact = [
        {
          contact_name: contactName,
          email: email,
          phone: phone,
          designation: "Manager",
          linkedin: "",
        },
      ];

      await pool.query(
        `
        UPDATE leads 
        SET contacts = $1
        WHERE id = $2
      `,
        [JSON.stringify(sampleContact), lead.id],
      );

      console.log(
        `✅ Added contact to Lead ${lead.id}: ${contactName} (${email})`,
      );
    }

    // Verify the contacts are now properly formatted
    console.log("\n📊 STEP 2: Verifying contact data format");

    const allLeads = await pool.query(`
      SELECT id, client_name, contacts
      FROM leads 
      ORDER BY id
      LIMIT 5
    `);

    allLeads.rows.forEach((lead) => {
      console.log(`\nLead ${lead.id}: "${lead.client_name}"`);
      console.log(`  Contacts type: ${typeof lead.contacts}`);
      console.log(`  Contacts is array: ${Array.isArray(lead.contacts)}`);

      if (lead.contacts && lead.contacts.length > 0) {
        const contact = lead.contacts[0];
        console.log(`  ✅ Contact Name: ${contact.contact_name}`);
        console.log(`  ✅ Email: ${contact.email}`);
        console.log(`  ✅ Phone: ${contact.phone}`);
      } else {
        console.log(`  ❌ No contact data available`);
      }
    });

    console.log("\n🎯 STEP 3: Testing API response format");

    // Test what the API would return
    const apiTestLead = await pool.query(`
      SELECT l.*, 
             CONCAT(u.first_name, ' ', u.last_name) as sales_rep_name,
             CONCAT(c.first_name, ' ', c.last_name) as creator_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users c ON l.created_by = c.id
      WHERE l.id = 1
    `);

    if (apiTestLead.rows.length > 0) {
      const lead = apiTestLead.rows[0];
      console.log("\n📡 API Response Preview for Lead 1:");
      console.log(`  Client: ${lead.client_name}`);
      console.log(`  Contacts: ${JSON.stringify(lead.contacts, null, 2)}`);

      if (lead.contacts && lead.contacts.length > 0) {
        const contact = lead.contacts[0];
        console.log(`\n✅ Frontend should display:`);
        console.log(
          `  Contact Person: ${contact.contact_name || "Not provided"}`,
        );
        console.log(`  Email: ${contact.email || "Not provided"}`);
        console.log(`  Phone: ${contact.phone || "Not provided"}`);
      }
    }

    console.log("\n✅ CONTACTS DATA FIX COMPLETE");
    console.log("==============================");
    console.log("🎯 Next steps:");
    console.log("1. Restart your local dev server");
    console.log("2. Navigate to a lead details page");
    console.log("3. Contact information should now display correctly");
    console.log(
      "4. If still showing 'Not provided', check browser console for errors",
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    pool.end();
  }
}

fixLocalContactsData().catch(console.error);
