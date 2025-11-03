const { pool } = require('./server/database/connection.ts');

async function checkUsers() {
  try {
    console.log('Checking specific users...');
    const result = await pool.query(`
      SELECT id, first_name, last_name, email, role, sso_provider, azure_object_id, status, created_at
      FROM users 
      WHERE email IN ('Maanas.m@mylapay.com', 'Prakash.R@mylapay.com', 'Yuvaraj.P@mylapay.com')
      ORDER BY created_at;
    `);
    
    console.log('Users found:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    console.log('\nChecking what unknown-users endpoint returns...');
    const unknownResult = await pool.query(`
      SELECT id, first_name, last_name, email, department, azure_object_id, created_at, role, sso_provider
      FROM users
      WHERE role = 'unknown' AND sso_provider = 'microsoft'
      ORDER BY created_at DESC
    `);
    
    console.log('Unknown users (what Azure assignment page should show):');
    console.log(JSON.stringify(unknownResult.rows, null, 2));
    
    console.log('\nChecking all users with unknown role...');
    const allUnknownResult = await pool.query(`
      SELECT id, first_name, last_name, email, department, azure_object_id, created_at, role, sso_provider
      FROM users
      WHERE role = 'unknown'
      ORDER BY created_at DESC
    `);
    
    console.log('All unknown users:');
    console.log(JSON.stringify(allUnknownResult.rows, null, 2));
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
