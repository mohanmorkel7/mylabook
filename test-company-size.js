const { pool } = require("./server/database/connection");

async function checkCompanySize() {
  console.log("🔍 Checking company_size field in database...\n");

  try {
    // Check if we're using the correct table name
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name = 'vcs' OR table_name = 'vc_leads')
    `);

    console.log(
      "Available tables:",
      tables.rows.map((r) => r.table_name),
    );

    // Check both possible table names
    for (const table of ["vcs", "vc_leads"]) {
      try {
        const result = await pool.query(`
          SELECT id, investor_name, company_size, country 
          FROM ${table} 
          WHERE id IN (5, 19, 21) 
          ORDER BY id
        `);

        if (result.rows.length > 0) {
          console.log(`\nData from ${table} table:`);
          result.rows.forEach((row) => {
            console.log(`ID: ${row.id}, Investor: ${row.investor_name}`);
            console.log(`  Company Size: '${row.company_size}'`);
            console.log(`  Country: '${row.country}'`);
            console.log("---");
          });
        }
      } catch (error) {
        console.log(`Table ${table} does not exist or error:`, error.message);
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
  }
}

checkCompanySize().catch(console.error);
