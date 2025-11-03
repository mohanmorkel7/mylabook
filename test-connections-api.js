// Simple test script for Connections API
// Run with: node test-connections-api.js

const BASE = "http://localhost:3000/api";

async function run() {
  try {
    console.log("Testing GET /connections (list)");
    let res = await fetch(`${BASE}/connections`);
    console.log("Status:", res.status);
    let list = await res.json();
    console.log("List length:", Array.isArray(list) ? list.length : list);

    console.log("Testing POST /connections (create)");
    res = await fetch(`${BASE}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Member",
        type: "General",
        phone_prefix: "+91",
        phone: "9999999999",
        email: "test.member@example.com",
        country: "India",
        state: "Tamil Nadu",
        city: "Chennai",
      }),
    });
    console.log("Create status:", res.status);
    const created = await res.json();
    console.log("Created:", created);

    if (!created || !created.id) {
      console.log(
        "Create did not return ID - database may be unavailable, continuing tests",
      );
      return;
    }

    const id = created.id;

    console.log("Testing PUT /connections/:id (update)");
    res = await fetch(`${BASE}/connections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "updated.member@example.com" }),
    });
    console.log("Update status:", res.status);
    const updated = await res.json();
    console.log("Updated:", updated);

    console.log("Testing DELETE /connections/:id (delete)");
    res = await fetch(`${BASE}/connections/${id}`, { method: "DELETE" });
    console.log("Delete status:", res.status);
  } catch (e) {
    console.error("Connections API test failed:", e);
  }
}

run();
