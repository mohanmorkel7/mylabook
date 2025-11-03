// Test script to verify FinOps client fix
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:8080/api';

async function testFinOpsClientFix() {
  console.log('🧪 Testing FinOps Client Fix...\n');

  try {
    // Test 1: Create a task with client information
    console.log('1. Creating task with client information...');
    const taskData = {
      task_name: "Test Client Fix Task",
      description: "Testing if client information is saved properly",
      client_id: "1",
      client_name: "Test Client Company",
      assigned_to: ["Test User"],
      reporting_managers: ["Manager 1"],
      escalation_managers: ["Manager 2"],
      effective_from: "2025-01-26",
      duration: "daily",
      is_active: true,
      subtasks: [
        {
          id: "test-1",
          name: "Test Subtask",
          description: "Test subtask description",
          start_time: "09:00",
          order_position: 0,
          status: "pending"
        }
      ],
      created_by: 1
    };

    const createResponse = await fetch(`${API_BASE}/finops/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData),
    });

    const createResult = await createResponse.json();
    console.log('✅ Create Response:', createResult);

    // Test 2: Fetch all tasks to verify client info is preserved
    console.log('\n2. Fetching all tasks to verify client information...');
    const fetchResponse = await fetch(`${API_BASE}/finops/tasks`);
    const allTasks = await fetchResponse.json();
    
    console.log('📋 Total tasks found:', allTasks.length);
    
    // Find our test task
    const testTask = allTasks.find(task => task.task_name === "Test Client Fix Task");
    if (testTask) {
      console.log('🎯 Test task found with client info:');
      console.log('   - Client ID:', testTask.client_id);
      console.log('   - Client Name:', testTask.client_name);
      console.log('   - Task Name:', testTask.task_name);
      
      if (testTask.client_id && testTask.client_name) {
        console.log('✅ SUCCESS: Client information is properly saved!');
      } else {
        console.log('❌ FAILED: Client information is missing!');
      }
    } else {
      console.log('❌ Test task not found in response');
    }

    // Test 3: Check for "Unknown Client" issues
    console.log('\n3. Checking for "Unknown Client" issues...');
    const unknownClientTasks = allTasks.filter(task => 
      !task.client_name || 
      task.client_name === "Unknown Client" || 
      task.client_name === "" || 
      task.client_name === "undefined"
    );
    
    console.log('🔍 Tasks with unknown/missing client info:', unknownClientTasks.length);
    if (unknownClientTasks.length > 0) {
      console.log('📝 Tasks with issues:');
      unknownClientTasks.forEach(task => {
        console.log(`   - ${task.task_name}: client_id=${task.client_id}, client_name="${task.client_name}"`);
      });
    } else {
      console.log('✅ No "Unknown Client" issues found!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testFinOpsClientFix();
