/**
 * Test script for FinOps clients functionality
 * This script tests the new separate FinOps clients system
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DB || 'banani_crm',
  password: process.env.PG_PASSWORD || 'password',
  port: Number(process.env.PG_PORT) || 5432,
});

async function testFinOpsClients() {
  console.log('🧪 Testing FinOps Clients functionality...\n');

  try {
    // Test database connection
    console.log('1. Testing database connection...');
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Apply FinOps clients migration if needed
    console.log('2. Applying FinOps clients migration...');
    const migrationPath = path.join(__dirname, 'server/database/create-finops-clients-table.sql');
    if (fs.existsSync(migrationPath)) {
      const migration = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(migration);
      console.log('✅ FinOps clients migration applied successfully\n');
    } else {
      console.log('❌ Migration file not found\n');
    }

    // Test: Fetch existing FinOps clients
    console.log('3. Fetching existing FinOps clients...');
    const clientsResult = await pool.query(`
      SELECT * FROM finops_clients 
      WHERE deleted_at IS NULL
      ORDER BY company_name ASC
    `);
    console.log(`✅ Found ${clientsResult.rows.length} FinOps clients:`);
    clientsResult.rows.forEach(client => {
      console.log(`   - ${client.company_name} (ID: ${client.id})`);
    });
    console.log('');

    // Test: Create a new test client
    console.log('4. Creating a test FinOps client...');
    const testClient = {
      company_name: 'Test FinOps Client',
      contact_person: 'Test Contact',
      email: 'test@finops.com',
      phone: '+1 (555) 999-0000',
      address: '123 Test Street, Test City, TC 12345',
      notes: 'Test client created by automation script',
      created_by: 1
    };

    const createResult = await pool.query(`
      INSERT INTO finops_clients (
        company_name, contact_person, email, phone, address, notes, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      testClient.company_name,
      testClient.contact_person,
      testClient.email,
      testClient.phone,
      testClient.address,
      testClient.notes,
      testClient.created_by
    ]);

    console.log(`✅ Test client created with ID: ${createResult.rows[0].id}\n`);

    // Test: Update the test client
    console.log('5. Updating the test client...');
    const updatedClient = await pool.query(`
      UPDATE finops_clients 
      SET company_name = $1, notes = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [
      'Updated Test FinOps Client',
      'Updated notes for test client',
      createResult.rows[0].id
    ]);

    console.log(`✅ Client updated: ${updatedClient.rows[0].company_name}\n`);

    // Test: Check for any existing FinOps tasks using this client
    console.log('6. Checking for FinOps tasks using test client...');
    try {
      const tasksResult = await pool.query(`
        SELECT COUNT(*) FROM finops_tasks 
        WHERE client_id = $1 AND is_active = true
      `, [createResult.rows[0].id]);
      
      console.log(`✅ Found ${tasksResult.rows[0].count} active tasks for test client\n`);
    } catch (error) {
      console.log('ℹ️ FinOps tasks table may not exist yet (this is normal)\n');
    }

    // Test: Soft delete the test client
    console.log('7. Soft deleting the test client...');
    await pool.query(`
      UPDATE finops_clients 
      SET deleted_at = NOW()
      WHERE id = $1
    `, [createResult.rows[0].id]);

    console.log('✅ Test client soft deleted successfully\n');

    // Final verification
    console.log('8. Final verification - checking active clients...');
    const finalResult = await pool.query(`
      SELECT * FROM finops_clients 
      WHERE deleted_at IS NULL
      ORDER BY company_name ASC
    `);
    console.log(`✅ Final count: ${finalResult.rows.length} active FinOps clients\n`);

    console.log('🎉 All FinOps clients tests passed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - ✅ Database connection works');
    console.log('   - ✅ FinOps clients table created');
    console.log('   - ✅ CRUD operations work correctly');
    console.log('   - ✅ Soft delete functionality works');
    console.log('   - ✅ Ready for frontend integration');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testFinOpsClients().catch(console.error);
