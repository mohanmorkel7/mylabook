const { pool } = require("./server/database/connection.ts");

const roleUpdates = [
  { email: "Gopikrishnan.P@mylapay.com", newRole: "unknown" },
  { email: "sarumathi.m@mylapay.com", newRole: "finops" },
  { email: "Maanas.m@mylapay.com", newRole: "switch_team" },
  { email: "Abirami@mylapay.com", newRole: "backend" },
  { email: "abinaya.s@mylapay.com", newRole: "backend" },
  { email: "Abinaya.M@mylapay.com", newRole: "backend" },
  { email: "Abinandan@mylapay.com", newRole: "backend" },
];

async function updateUserRoles() {
  try {
    console.log("🔄 Updating user roles in database...\n");

    let successCount = 0;
    let failCount = 0;

    for (const update of roleUpdates) {
      try {
        const result = await pool.query(
          `UPDATE users 
           SET role = $1, updated_at = NOW() 
           WHERE email = $2 
           RETURNING id, first_name, last_name, email, role`,
          [update.newRole, update.email],
        );

        if (result.rows.length > 0) {
          const user = result.rows[0];
          console.log(
            `✅ ${user.first_name} ${user.last_name} (${user.email}) → ${user.role}`,
          );
          successCount++;
        } else {
          console.log(`❌ User not found: ${update.email}`);
          failCount++;
        }
      } catch (error) {
        console.log(`❌ Error updating ${update.email}:`, error.message);
        failCount++;
      }
    }

    console.log(`\n📊 Update Summary:`);
    console.log(`✅ Successfully updated: ${successCount} users`);
    console.log(`❌ Failed: ${failCount} users`);

    if (successCount > 0) {
      console.log(
        `\n🎉 Role updates completed! Refresh /admin/users to see the changes.`,
      );
      console.log(`\n📋 Expected role groups after update:`);
      console.log(`• Development: Prakash R, Yuvaraj P (2 users)`);
      console.log(`• FinOps: sarumathi.m, abinaya.r (2 users)`);
      console.log(`• Switch Team: Maanas M (1 user)`);
      console.log(
        `• Backend Development: Abirami, abinaya.s, Abinaya.M, Abinandan (4 users)`,
      );
      console.log(`• Unknown/Unassigned: Gopikrishnan P (1 user)`);
      console.log(`• Admin: mohan.m, santhanakumar, mohan, admin (4 users)`);
      console.log(`• Sales: akshaya.k (1 user)`);
    }

    await pool.end();
  } catch (error) {
    console.error("💥 Error updating roles:", error);
    process.exit(1);
  }
}

updateUserRoles();
