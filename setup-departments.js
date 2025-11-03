const { pool } = require("./server/database/connection");
const fs = require("fs");
const path = require("path");

async function setupDepartments() {
  console.log("🚀 Setting up department-based permission system...\n");

  try {
    // 1. Run database migration
    console.log("1. Running database migration...");
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, "server/database/add-user-departments.sql"),
      "utf8",
    );

    await pool.query(migrationSQL);
    console.log("✅ Database migration completed\n");

    // 2. Load department service
    const {
      DepartmentService,
    } = require("./server/services/departmentService");

    // 3. Load users from JSON
    console.log("2. Loading users from department mapping JSON...");
    await DepartmentService.loadUserDepartmentsFromJSON();
    console.log("✅ Users loaded from JSON\n");

    // 4. Verify setup
    console.log("3. Verifying setup...");
    const departments = await DepartmentService.getAllDepartments();
    console.log(`✅ Found ${departments.length} departments:`);

    departments.forEach((dept) => {
      console.log(
        `   - ${dept.name} (${dept.code}): ${dept.permissions.join(", ")}`,
      );
    });

    console.log("\n4. Checking loaded users...");
    const testUsers = ["Abinandan@mylapay.com", "Abinaya.M@mylapay.com"];

    for (const email of testUsers) {
      const userInfo = await DepartmentService.getUserDepartmentByEmail(email);
      if (userInfo) {
        console.log(`✅ ${email}:`);
        console.log(`   Department: ${userInfo.department}`);
        console.log(`   Permissions: ${userInfo.permissions.join(", ")}`);
      } else {
        console.log(`❌ ${email}: Not found`);
      }
    }

    console.log("\n🎉 Department system setup completed successfully!");
    console.log("\nNext steps:");
    console.log(
      "1. Update your Microsoft SSO login to use the new /sso/login endpoint",
    );
    console.log("2. Users will now get permissions based on their department");
    console.log("3. Navigation menu will show/hide based on user permissions");
    console.log(
      "4. Add more users to server/data/user-departments.json as needed",
    );
  } catch (error) {
    console.error("❌ Error setting up departments:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run setup
setupDepartments().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
