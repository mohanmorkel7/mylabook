// Test script for template endpoints
const API_BASE = "http://localhost:8080/api";

async function testTemplateEndpoints() {
  console.log("=== Testing Template Endpoints ===\n");

  try {
    // Test 1: Get all templates
    console.log("1. Testing GET /templates-production:");
    const allTemplates = await fetch(`${API_BASE}/templates-production`);
    const allTemplatesData = await allTemplates.json();
    console.log(
      `Found ${allTemplatesData.length} templates:`,
      allTemplatesData.map((t) => ({
        id: t.id,
        name: t.name,
        category_id: t.category_id,
      })),
    );

    // Test 2: Get template categories
    console.log("\n2. Testing GET /templates-production/categories:");
    const categories = await fetch(
      `${API_BASE}/templates-production/categories`,
    );
    const categoriesData = await categories.json();
    console.log(
      `Found ${categoriesData.length} categories:`,
      categoriesData.map((c) => ({ id: c.id, name: c.name })),
    );

    // Test 3: Get templates by category (category ID 2 = Leads)
    console.log("\n3. Testing GET /templates-production/category/2:");
    const categoryTemplates = await fetch(
      `${API_BASE}/templates-production/category/2`,
    );
    const categoryTemplatesData = await categoryTemplates.json();
    console.log(
      `Found ${categoryTemplatesData.length} templates for category 2 (Leads):`,
      categoryTemplatesData.map((t) => ({
        id: t.id,
        name: t.name,
        category_id: t.category_id,
      })),
    );

    // Test 4: Create a new template
    console.log(
      "\n4. Testing POST /templates-production (creating new template):",
    );
    const newTemplate = {
      name: "Test Lead Template",
      description: "Test template created via API",
      category_id: 2, // Leads category
      created_by: 1,
      steps: [
        {
          name: "Initial Contact",
          description: "First step in lead process",
          step_order: 1,
          default_eta_days: 1,
          auto_alert: false,
          email_reminder: false,
          probability_percent: 10,
        },
        {
          name: "Qualification",
          description: "Qualify the lead",
          step_order: 2,
          default_eta_days: 2,
          auto_alert: true,
          email_reminder: true,
          probability_percent: 25,
        },
      ],
    };

    const createResponse = await fetch(`${API_BASE}/templates-production`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTemplate),
    });

    if (createResponse.ok) {
      const createdTemplate = await createResponse.json();
      console.log("Created template:", {
        id: createdTemplate.id,
        name: createdTemplate.name,
        category_id: createdTemplate.category_id,
      });

      // Test 5: Get templates by category again to verify it appears
      console.log(
        "\n5. Testing GET /templates-production/category/2 (after creating template):",
      );
      const updatedCategoryTemplates = await fetch(
        `${API_BASE}/templates-production/category/2`,
      );
      const updatedCategoryTemplatesData =
        await updatedCategoryTemplates.json();
      console.log(
        `Found ${updatedCategoryTemplatesData.length} templates for category 2 (after creation):`,
        updatedCategoryTemplatesData.map((t) => ({
          id: t.id,
          name: t.name,
          category_id: t.category_id,
        })),
      );
    } else {
      const error = await createResponse.text();
      console.log("Failed to create template:", createResponse.status, error);
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testTemplateEndpoints();
