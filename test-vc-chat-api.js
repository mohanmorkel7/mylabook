const axios = require("axios");

const API_BASE = "http://localhost:8080/api";

async function testVCChatAPI() {
  console.log("🧪 Testing VC chat API endpoints...");

  try {
    // Test 1: Create a VC step chat
    console.log("\n1️⃣ Testing VC step chat creation...");

    const createChatData = {
      user_id: 1,
      user_name: "Test User",
      message: "This is a test VC step chat message",
      message_type: "text",
      is_rich_text: false,
    };

    const createResponse = await axios.post(
      `${API_BASE}/vc/steps/1/chats`,
      createChatData,
    );
    console.log("✅ Created VC step chat:", createResponse.data.id);
    const chatId = createResponse.data.id;

    // Test 2: Edit the chat message
    console.log("\n2️⃣ Testing VC chat edit...");

    const editData = {
      message: "This is an UPDATED test VC step chat message",
      is_rich_text: true,
    };

    try {
      const editResponse = await axios.put(
        `${API_BASE}/vc/chats/${chatId}`,
        editData,
      );
      console.log("✅ Successfully edited VC chat");
      console.log("Updated message:", editResponse.data.message);
    } catch (editError) {
      console.error(
        "❌ Error editing VC chat:",
        editError.response?.data || editError.message,
      );
      console.log("This could be the issue the user was experiencing!");

      // Try to edit via leads endpoint (what was happening before)
      try {
        console.log("\n🔍 Testing edit via leads endpoint (old behavior)...");
        const leadsEditResponse = await axios.put(
          `${API_BASE}/leads/chats/${chatId}`,
          editData,
        );
        console.log(
          "❌ Leads endpoint worked - this is the problem! It should use VC endpoint.",
        );
      } catch (leadsError) {
        console.log("✅ Leads endpoint correctly rejected VC chat ID");
      }
    }

    // Test 3: Get step chats to verify the edit
    console.log("\n3️⃣ Testing VC step chat retrieval...");

    const getResponse = await axios.get(`${API_BASE}/vc/steps/1/chats`);
    console.log(`✅ Retrieved ${getResponse.data.length} chats for step 1`);

    const updatedChat = getResponse.data.find((chat) => chat.id === chatId);
    if (updatedChat) {
      console.log("Message content:", updatedChat.message);
      console.log("Is rich text:", updatedChat.is_rich_text);
    }

    // Test 4: Delete the chat
    console.log("\n4️⃣ Testing VC chat deletion...");

    try {
      const deleteResponse = await axios.delete(
        `${API_BASE}/vc/chats/${chatId}`,
      );
      console.log("✅ Successfully deleted VC chat");
    } catch (deleteError) {
      console.error(
        "❌ Error deleting VC chat:",
        deleteError.response?.data || deleteError.message,
      );
    }

    console.log("\n✅ All VC chat API tests completed!");
  } catch (error) {
    console.error(
      "❌ Error testing VC chat API:",
      error.response?.data || error.message,
    );

    if (error.code === "ECONNREFUSED") {
      console.log(
        "💡 Make sure the development server is running on port 8080",
      );
    } else if (error.response?.status === 404) {
      console.log(
        "💡 The endpoint might not exist or the VC/step ID is invalid",
      );
    }
  }
}

// Also test with mock data
async function testWithMockData() {
  console.log("\n🎭 Testing with database unavailable (mock data)...");

  try {
    // When database is unavailable, the system should use mock data
    const mockCreateData = {
      user_id: 1,
      user_name: "Mock Test User",
      message: "Mock VC step chat message",
      message_type: "text",
      is_rich_text: false,
    };

    const mockCreateResponse = await axios.post(
      `${API_BASE}/vc/steps/2/chats`,
      mockCreateData,
    );
    console.log("✅ Created mock VC step chat:", mockCreateResponse.data.id);

    // Try to edit the mock chat
    const mockEditData = {
      message: "Updated mock VC step chat message",
      is_rich_text: true,
    };

    const mockEditResponse = await axios.put(
      `${API_BASE}/vc/chats/${mockCreateResponse.data.id}`,
      mockEditData,
    );
    console.log("✅ Successfully edited mock VC chat");
  } catch (error) {
    console.error(
      "❌ Error with mock data:",
      error.response?.data || error.message,
    );
  }
}

async function runAllTests() {
  await testVCChatAPI();
  await testWithMockData();
}

runAllTests();
