// Test the country initialization logic from CreateVC.tsx

const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Singapore",
  "UAE",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Japan",
  "Other",
];

function testCountryInitialization(savedCountry) {
  console.log(`\n🧪 Testing country initialization with: "${savedCountry}"`);

  // This is the logic from CreateVC.tsx lines 163-170
  const country = COUNTRIES.includes(savedCountry || "")
    ? savedCountry || ""
    : savedCountry
      ? "Other"
      : "";

  const custom_country = COUNTRIES.includes(savedCountry || "")
    ? ""
    : savedCountry || "";

  console.log(`  country field: "${country}"`);
  console.log(`  custom_country field: "${custom_country}"`);

  return { country, custom_country };
}

function testCountrySaving(country, custom_country) {
  console.log(
    `\n💾 Testing country saving with country="${country}", custom_country="${custom_country}"`,
  );

  // This is the logic from both handlePartialSave and handleSubmit (line 655 and 585)
  const finalCountry = custom_country || country;

  console.log(`  Final country to save: "${finalCountry}"`);

  return finalCountry;
}

function runFullTest(initialCountry) {
  console.log(`\n🔄 Full test cycle for: "${initialCountry}"`);
  console.log("=".repeat(50));

  // Step 1: Save initial country
  console.log("1. Initial save:");
  const savedCountry1 = testCountrySaving(initialCountry, "");

  // Step 2: Load from database (simulate draft resume)
  console.log("2. Resume from draft:");
  const { country, custom_country } = testCountryInitialization(savedCountry1);

  // Step 3: Save again (this is where the issue might occur)
  console.log("3. Save again after resume:");
  const savedCountry2 = testCountrySaving(country, custom_country);

  // Check if country is preserved
  console.log("4. Final result:");
  if (savedCountry1 === savedCountry2) {
    console.log("  ✅ Country preserved correctly");
  } else {
    console.log("  ❌ Country NOT preserved!");
    console.log(`     Initial: "${savedCountry1}"`);
    console.log(`     Final: "${savedCountry2}"`);
  }

  return { initial: savedCountry1, final: savedCountry2 };
}

// Test cases
console.log("🧪 Testing CreateVC Country Field Logic");
console.log("=====================================");

// Test 1: Country in the predefined list
runFullTest("India");

// Test 2: Country NOT in the predefined list
runFullTest("Netherlands");

// Test 3: Another country NOT in the list
runFullTest("Brazil");

// Test 4: Empty country
runFullTest("");

// Test 5: Null country
runFullTest(null);

// Test 6: "Other" as country
runFullTest("Other");

console.log("\n🏁 Test completed!");
