/**
 * Test script to verify that department upload correctly checks database
 * and skips existing users by email
 */

const testData = {
  departments: {
    admin: {
      name: "Administration",
      permissions: ["admin", "users", "reports", "settings"],
      users: [],
    },
    development: {
      name: "Development Team",
      permissions: ["product", "development"],
      users: [],
    },
  },
  users: [
    {
      email: "test1@mylapay.com",
      displayName: "Test User 1",
      givenName: "Test",
      surname: "User1",
      jobTitle: "Developer",
      department: "development",
      ssoId: "test-sso-1",
    },
    {
      email: "test2@mylapay.com",
      displayName: "Test User 2",
      givenName: "Test",
      surname: "User2",
      jobTitle: "Admin",
      department: "admin",
      ssoId: "test-sso-2",
    },
    {
      email: "Maanas.m@mylapay.com", // This email exists in database
      displayName: "Maanas M",
      givenName: "Maanas",
      surname: "M",
      jobTitle: "Senior Associate Technology",
      department: "development",
      ssoId: "a8400ea8-5e8a-41ef-aa9a-5621f3822876",
    },
    {
      email: "Prakash.R@mylapay.com", // This email exists in database
      displayName: "Prakash R",
      givenName: "Prakash",
      surname: "R",
      jobTitle: "Associate Technology",
      department: "development",
      ssoId: "304a7b09-f024-45c4-83f3-ca898a356bef",
    },
  ],
};

async function testDepartmentUpload() {
  try {
    console.log("Testing department upload with existing users...");
    console.log(`Total users in test data: ${testData.users.length}`);

    // The emails that should exist in database (from previous context)
    const expectedExistingEmails = [
      "Maanas.m@mylapay.com",
      "Prakash.R@mylapay.com",
    ];

    console.log("Expected existing emails (should be skipped):");
    expectedExistingEmails.forEach((email) => console.log(`  - ${email}`));

    const response = await fetch("/api/auth/admin/upload-departments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();

    if (result.success) {
      console.log("\n✅ Upload successful!");
      console.log("Response message:", result.message);

      if (result.data) {
        console.log("\nDetailed results:");
        console.log(`- New users added: ${result.data.newUserCount}`);
        console.log(
          `- Users skipped (in database): ${result.data.skippedInDatabase}`,
        );
        console.log(`- Users skipped (in JSON): ${result.data.skippedInJson}`);
        console.log(
          `- Total users in JSON now: ${result.data.totalUsersInJson}`,
        );
        console.log(`- Departments processed: ${result.data.departmentCount}`);

        // Verify that existing users were properly skipped
        const expectedSkipped = expectedExistingEmails.length;
        const actualSkipped = result.data.skippedInDatabase;

        if (actualSkipped >= expectedSkipped) {
          console.log(
            "\n✅ Database checking working correctly - existing users were skipped",
          );
        } else {
          console.log(
            "\n❌ Database checking may not be working - fewer users skipped than expected",
          );
        }
      }
    } else {
      console.log("\n❌ Upload failed:", result.error);
      console.log("Message:", result.message);
    }
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

// Instructions for manual testing
console.log(`
=== Department Upload Database Check Test ===

This test demonstrates that the department upload feature:
1. Checks the database for existing users by email
2. Skips users whose emails already exist 
3. Only adds genuinely new users
4. Provides detailed statistics

To run this test:
1. Ensure PostgreSQL database is running
2. Upload this test data via /admin/departments page
3. Check the results to verify existing users were skipped

Expected behavior:
- Maanas.m@mylapay.com should be skipped (exists in DB)
- Prakash.R@mylapay.com should be skipped (exists in DB)  
- test1@mylapay.com should be added (new user)
- test2@mylapay.com should be added (new user)

Test data is ready for upload:
`);

console.log(JSON.stringify(testData, null, 2));

// Uncomment the line below to run the test programmatically
// testDepartmentUpload();
