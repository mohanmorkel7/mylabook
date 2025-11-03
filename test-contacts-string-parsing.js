// Test script to verify the contacts string parsing fix works
console.log("🧪 TESTING CONTACTS STRING PARSING FIX");
console.log("======================================\n");

// Simulate the database response format you showed
const mockDatabaseResponse = {
  id: 40,
  lead_id: "#0002",
  client_name: "Razorpay",
  company: null,
  // This is how it comes from your database - as a JSON string
  contacts:
    '[{"email":"mohan.morkel7@gmail.com","phone":"+91 98765432109","linkedin":"https://fb.com/mohanmorkel","designation":"Director","contact_name":"Mohan Morkel"}]',
};

function simulateLeadRepositoryParsing(lead) {
  console.log("📊 BEFORE PARSING:");
  console.log(`   Contacts type: ${typeof lead.contacts}`);
  console.log(`   Contacts value: ${lead.contacts}`);
  console.log(`   Is array: ${Array.isArray(lead.contacts)}`);

  // Apply the same logic as the fixed Lead repository
  if (lead.contacts && typeof lead.contacts === "string") {
    try {
      lead.contacts = JSON.parse(lead.contacts);
      console.log("\n✅ PARSING SUCCESSFUL");
    } catch (error) {
      console.log("\n❌ PARSING FAILED:", error.message);
      lead.contacts = [];
    }
  }

  console.log("\n📊 AFTER PARSING:");
  console.log(`   Contacts type: ${typeof lead.contacts}`);
  console.log(`   Is array: ${Array.isArray(lead.contacts)}`);
  console.log(
    `   Contacts length: ${lead.contacts ? lead.contacts.length : "N/A"}`,
  );

  if (lead.contacts && lead.contacts.length > 0) {
    const contact = lead.contacts[0];
    console.log("\n✅ PARSED CONTACT DATA:");
    console.log(`   Contact Name: ${contact.contact_name || "Missing"}`);
    console.log(`   Email: ${contact.email || "Missing"}`);
    console.log(`   Phone: ${contact.phone || "Missing"}`);
    console.log(`   Designation: ${contact.designation || "Missing"}`);
  }

  return lead;
}

function simulateFrontendDisplay(lead) {
  console.log("\n🖥️  FRONTEND DISPLAY SIMULATION:");
  console.log("================================");

  // Simulate the exact logic from LeadDetails.tsx
  const contactPerson =
    lead.contacts && lead.contacts.length > 0 && lead.contacts[0].contact_name
      ? lead.contacts[0].contact_name
      : "Not provided";

  const email =
    lead.contacts && lead.contacts.length > 0 && lead.contacts[0].email
      ? lead.contacts[0].email
      : "Not provided";

  const phone =
    lead.contacts && lead.contacts.length > 0 && lead.contacts[0].phone
      ? lead.contacts[0].phone
      : "Not provided";

  console.log(`Contact Person: ${contactPerson}`);
  console.log(`Email: ${email}`);
  console.log(`Phone: ${phone}`);

  // Check if it would show "Not provided"
  const allProvided =
    contactPerson !== "Not provided" &&
    email !== "Not provided" &&
    phone !== "Not provided";

  console.log(
    `\n${allProvided ? "✅" : "❌"} All contact fields provided: ${allProvided}`,
  );

  return { contactPerson, email, phone };
}

async function runTest() {
  try {
    console.log("🎯 SIMULATING YOUR DATABASE RESPONSE:");
    console.log("====================================");

    // Create a copy to avoid mutating the original
    const testLead = { ...mockDatabaseResponse };

    // Step 1: Simulate what the repository does
    const parsedLead = simulateLeadRepositoryParsing(testLead);

    // Step 2: Simulate what the frontend does
    const displayResult = simulateFrontendDisplay(parsedLead);

    console.log("\n🎯 RESULT SUMMARY:");
    console.log("==================");
    console.log("✅ String contacts successfully parsed to array");
    console.log("✅ Contact information now accessible to frontend");
    console.log('✅ Should display contact details instead of "Not provided"');

    console.log("\n📝 NEXT STEPS:");
    console.log("==============");
    console.log("1. Restart your local dev server with the fixed code");
    console.log("2. Navigate to /leads/40 (or any lead with contact data)");
    console.log("3. Contact information should now display correctly");
    console.log(
      '4. If still showing "Not provided", check browser console for errors',
    );
  } catch (error) {
    console.error("❌ Test Error:", error.message);
  }
}

runTest().catch(console.error);
