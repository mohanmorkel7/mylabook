// Test SSO login for Mohan Raj after adding to department mapping

const testSSOLogin = async () => {
  console.log("🧪 Testing SSO login for Mohan Raj Ravichandran...");

  // Mock SSO user data from Azure AD (as provided by user)
  const ssoUser = {
    businessPhones: [],
    displayName: "Mohan Raj Ravichandran",
    givenName: "Mohan Raj",
    jobTitle: "Director Technology",
    mail: "mohan.m@mylapay.com",
    mobilePhone: null,
    officeLocation: null,
    preferredLanguage: "en-US",
    surname: "Ravichandran",
    userPrincipalName: "mohan.m@mylapay.com",
    id: "a416d1c8-bc01-4acd-8cad-3210a78d01a9", // This will be the azureObjectId
  };

  try {
    const response = await fetch("http://localhost:5173/api/sso/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ssoUser }),
    });

    const result = await response.json();

    console.log(`\n📋 SSO Login Test Results:`);
    console.log(`Status: ${response.status}`);
    console.log(`Success: ${result.success}`);

    if (result.success) {
      console.log(`✅ Login successful!`);
      console.log(`User: ${result.user.name}`);
      console.log(`Email: ${result.user.email}`);
      console.log(`Department: ${result.user.department}`);
      console.log(`Role: ${result.user.role}`);
      console.log(`Job Title: ${result.user.jobTitle}`);
      console.log(`SSO ID: ${result.user.ssoId}`);
      console.log(
        `Permissions: ${result.user.permissions?.join(", ") || "None"}`,
      );
    } else {
      console.log(`❌ Login failed: ${result.error}`);
    }
  } catch (error) {
    console.error(`🚨 Test failed with error:`, error.message);
  }
};

// Also test getting current department data
const testCurrentDepartments = async () => {
  console.log("\n📁 Testing current department mapping...");

  try {
    const response = await fetch(
      "http://localhost:5173/api/sso/admin/current-departments",
    );
    const result = await response.json();

    if (result.success && result.data) {
      console.log("✅ Department mapping loaded successfully");
      console.log(
        `Departments: ${Object.keys(result.data.departments).length}`,
      );
      console.log(`Users: ${result.data.users.length}`);

      // Check if Mohan is in the mapping
      const mohanUser = result.data.users.find(
        (u) => u.email === "mohan.m@mylapay.com",
      );
      if (mohanUser) {
        console.log("✅ Mohan Raj found in mapping:");
        console.log(`  - Department: ${mohanUser.department}`);
        console.log(`  - Job Title: ${mohanUser.jobTitle}`);
        console.log(`  - SSO ID: ${mohanUser.ssoId}`);
      } else {
        console.log("❌ Mohan Raj NOT found in mapping");
      }
    } else {
      console.log("❌ Failed to get department mapping");
    }
  } catch (error) {
    console.error(`🚨 Department test failed:`, error.message);
  }
};

// Run tests
(async () => {
  await testCurrentDepartments();
  await testSSOLogin();
})();
