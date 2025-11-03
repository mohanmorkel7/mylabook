#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

async function testFileUpload() {
  console.log("🧪 Testing File Upload Functionality\n");

  try {
    // Check if test file exists
    const testFilePath = path.join(process.cwd(), "test-upload.txt");
    if (!fs.existsSync(testFilePath)) {
      console.log("❌ Test file not found:", testFilePath);
      return;
    }

    // Create FormData for upload
    const FormData = require("form-data");
    const formData = new FormData();

    const fileStream = fs.createReadStream(testFilePath);
    formData.append("files", fileStream, "test-upload.txt");

    console.log("📤 Uploading test file via API...");

    // Test the upload endpoint
    const response = await fetch("http://localhost:5173/api/files/upload", {
      method: "POST",
      body: formData,
      headers: formData.getHeaders(),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log("✅ Upload successful!");
      console.log("📊 Upload result:", JSON.stringify(result, null, 2));

      // Check if file actually exists in uploads directory
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      const uploadedFiles = fs.readdirSync(uploadsDir);
      console.log("📁 Files in uploads directory:", uploadedFiles);

      // Test download of the uploaded file
      if (result.files && result.files.length > 0) {
        const uploadedFile = result.files[0];
        console.log(`\n📥 Testing download of: ${uploadedFile.filename}`);

        const downloadResponse = await fetch(
          `http://localhost:5173/api/files/download/${uploadedFile.filename}`,
        );
        if (downloadResponse.ok) {
          console.log("✅ Download test successful!");
          const fileContent = await downloadResponse.text();
          console.log(
            "📄 First 100 characters of downloaded file:",
            fileContent.substring(0, 100),
          );
        } else {
          console.log("❌ Download test failed:", downloadResponse.status);
        }
      }
    } else {
      console.log("❌ Upload failed:", result);
    }
  } catch (error) {
    console.error("💥 Test failed with error:", error.message);
  }
}

// Only run if node-fetch and form-data are available
(async () => {
  try {
    global.fetch = require("node-fetch");
    await testFileUpload();
  } catch (importError) {
    console.log("⚠️  node-fetch not available, skipping automated test");
    console.log("📝 Manual test required: Use the UI to upload a file in chat");
  }
})();
