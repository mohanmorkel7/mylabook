console.log("Testing endpoint manually...");

fetch("/api/activity-production/test")
  .then((response) => {
    console.log("Response status:", response.status);
    console.log(
      "Response headers:",
      Object.fromEntries(response.headers.entries()),
    );
    return response.text();
  })
  .then((text) => {
    console.log("Response text:", text);
    try {
      const json = JSON.parse(text);
      console.log("Parsed JSON:", json);
    } catch (e) {
      console.log("Not valid JSON");
    }
  })
  .catch((error) => {
    console.error("Fetch error:", error);
  });
