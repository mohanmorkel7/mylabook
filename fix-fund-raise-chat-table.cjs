#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration from environment variables
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DB || 'crm_dev',
  password: process.env.PG_PASSWORD || 'password',
  port: Number(process.env.PG_PORT) || 5432,
  ssl: false,
});

async function ensureFundRaiseChatTable() {
  console.log('🔧 Ensuring fund_raise_step_chats table exists...');
  
  try {
    const client = await pool.connect();
    
    // Check if fund_raise_step_chats table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'fund_raise_step_chats'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('📋 Creating fund_raise_step_chats table...');
      
      // Read and execute the fund raise steps schema
      const schemaPath = path.join(__dirname, 'server/database/create-fund-raise-steps.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schema);
        console.log('✅ fund_raise_step_chats table created successfully');
      } else {
        // Fallback: create table manually
        await client.query(`
          -- Fund Raise steps table
          CREATE TABLE IF NOT EXISTS fund_raise_steps (
            id SERIAL PRIMARY KEY,
            fund_raise_id INTEGER NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
            priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
            assigned_to INTEGER,
            due_date DATE,
            completed_date DATE,
            order_index INTEGER NOT NULL DEFAULT 0,
            probability_percent INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- Chat/comments for fund raise steps
          CREATE TABLE IF NOT EXISTS fund_raise_step_chats (
            id SERIAL PRIMARY KEY,
            step_id INTEGER NOT NULL,
            user_id INTEGER,
            user_name VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text','image','file','system')),
            is_rich_text BOOLEAN DEFAULT false,
            attachments JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_frs_chats_step_id ON fund_raise_step_chats(step_id);
        `);
        console.log('✅ fund_raise_step_chats table created successfully (fallback)');
      }
    } else {
      console.log('✅ fund_raise_step_chats table already exists');
    }
    
    // Test if we can query the table
    const testQuery = await client.query('SELECT COUNT(*) FROM fund_raise_step_chats;');
    console.log(`📊 Current chats in fund_raise_step_chats: ${testQuery.rows[0].count}`);
    
    // Check table schema
    const schemaQuery = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'fund_raise_step_chats'
      ORDER BY ordinal_position;
    `);
    console.log('📋 Table schema:', schemaQuery.rows);
    
    client.release();
    console.log('🎉 Fund raise chat table verification completed!');
    
  } catch (error) {
    console.error('❌ Error ensuring fund_raise_step_chats table:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the fix
ensureFundRaiseChatTable().catch(console.error);
