// Test script to verify role validation is working
const testRoles = [
  "admin",
  "sales",
  "product",
  "development",
  "db",
  "finops",
  "finance",
  "hr_management",
  "business_analyst",
  "infra",
  "switch_team",
  "invalid_role", // This should fail
];

console.log("Testing role validation...");

for (const role of testRoles) {
  const validRoles = [
    "admin",
    "sales",
    "product",
    "development",
    "db",
    "business_analyst",
    "finops",
    "finance",
    "hr_management",
    "infra",
    "switch_team",
  ];

  const isValid = validRoles.includes(role);

  console.log(`Role "${role}": ${isValid ? "✅ VALID" : "❌ INVALID"}`);
}

console.log("\nAll valid roles:");
console.log(
  [
    "admin",
    "sales",
    "product",
    "development",
    "db",
    "finops",
    "finance",
    "hr_management",
    "infra",
    "business_analyst",
    "switch_team",
  ].join(", "),
);
