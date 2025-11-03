const { pool } = require("./server/database/connection.ts");

const roleCorrections = [
  { email: "Gopikrishnan.P@mylapay.com", correctRole: "unknown" }, // N/A -> unknown
  { email: "sarumathi.m@mylapay.com", correctRole: "finops" }, // development -> finops
  { email: "Maanas.m@mylapay.com", correctRole: "switch_team" }, // development -> switch_team
  { email: "Abirami@mylapay.com", correctRole: "backend" }, // development -> backend
  { email: "abinaya.s@mylapay.com", correctRole: "backend" }, // development -> backend
  { email: "Abinaya.M@mylapay.com", correctRole: "backend" }, // development -> backend
  { email: "Abinandan@mylapay.com", correctRole: "backend" }, // development -> backend
  // Prakash.R and Yuvaraj.P should stay as 'development' - they're correct
];

async function fixUserRoles() {
  try {
    console.log("🔧 Fixing user roles in database...\n");

    for (const correction of roleCorrections) {
      console.log(
        `Updating ${correction.email}: development -> ${correction.correctRole}`,
      );

      const result = await pool.query(
        "UPDATE users SET role = $1, updated_at = NOW() WHERE email = $2 RETURNING id, first_name, last_name, email, role",
        [correction.correctRole, correction.email],
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        console.log(
          `  ✅ Updated: ${user.first_name} ${user.last_name} -> ${user.role}`,
        );
      } else {
        console.log(`  ❌ User not found: ${correction.email}`);
      }
    }

    console.log("\n🎉 Role corrections completed!");
    console.log("🔄 Refresh /admin/users to see the updated role groups.");

    // Show final state
    console.log("\n📊 Expected role distribution after fix:");
    console.log("• Development: PR Prakash R, YP Yuvaraj P (2 users)");
    console.log("• FinOps: SM Sarumathi Manickam, abinaya.r (2 users)");
    console.log("• Switch Team: MM Maanas M (1 user)");
    console.log("• Backend Development: AU, AS, AM, AN (4 users)");
    console.log("• Unknown/Unassigned: GP Gopikrishnan P (1 user)");
    console.log("• Admin: mohan.m, santhanakumar, mohan, admin (4 users)");
    console.log("• Sales: akshaya.k (1 user)");

    await pool.end();
  } catch (error) {
    console.error("❌ Error fixing user roles:", error);
    process.exit(1);
  }
}

fixUserRoles();
