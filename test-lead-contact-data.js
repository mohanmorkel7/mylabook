// Test script to verify lead contact data is displaying correctly
console.log("🧪 TESTING LEAD CONTACT DATA");
console.log("============================\n");

async function testLeadContactData() {
  try {
    // Test leads 1-4 to check contact information
    for (let leadId = 1; leadId <= 4; leadId++) {
      console.log(`📋 TESTING LEAD ${leadId}`);

      const response = await fetch(`http://localhost:8080/api/leads/${leadId}`);
      if (response.ok) {
        const leadData = await response.json();
        console.log(
          `✅ Lead ${leadId}: "${leadData.title || leadData.client_name}"`,
        );

        if (leadData.contacts && leadData.contacts.length > 0) {
          const contact = leadData.contacts[0];
          console.log(
            `   📞 Contact Person: ${contact.contact_name || "Not provided"}`,
          );
          console.log(`   📧 Email: ${contact.email || "Not provided"}`);
          console.log(`   📱 Phone: ${contact.phone || "Not provided"}`);
          console.log(
            `   🏢 Company: ${leadData.company || leadData.client_name || "Not provided"}`,
          );

          // Check for missing data
          const missing = [];
          if (!contact.contact_name) missing.push("contact_name");
          if (!contact.email) missing.push("email");
          if (!contact.phone) missing.push("phone");

          if (missing.length > 0) {
            console.log(`   ❌ Missing fields: ${missing.join(", ")}`);
          } else {
            console.log(`   ✅ All contact fields present`);
          }
        } else {
          console.log(`   ❌ No contacts array or empty contacts`);
        }
      } else {
        console.log(`❌ Failed to fetch lead ${leadId}: ${response.status}`);
      }
      console.log("");
    }

    console.log("✅ CONTACT DATA TEST COMPLETE");
    console.log("=============================");
    console.log('🎯 If you see "Not provided" in the UI:');
    console.log("1. Check that you're viewing the correct lead");
    console.log("2. Try refreshing the browser page");
    console.log("3. Check browser console for any errors");
    console.log("4. Verify the API response above matches what you expect");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testLeadContactData().catch(console.error);
