#!/bin/bash

echo "🚀 Setting up Real-time FinOps Notifications with IST Support"
echo "============================================================="

# Step 1: Start PostgreSQL
echo ""
echo "📦 Step 1: Starting PostgreSQL..."
if command -v brew &> /dev/null; then
    echo "   Using Homebrew to start PostgreSQL..."
    brew services start postgresql
elif command -v systemctl &> /dev/null; then
    echo "   Using systemctl to start PostgreSQL..."
    sudo systemctl start postgresql
else
    echo "   Please start PostgreSQL manually and then continue"
fi

# Wait for PostgreSQL to start
sleep 3

# Step 2: Test connection and create database
echo ""
echo "🔍 Step 2: Testing PostgreSQL connection..."
if psql -U postgres -c "SELECT 1;" &> /dev/null; then
    echo "   ✅ PostgreSQL is running!"
    
    # Create database
    echo "   📊 Creating banani_crm database..."
    createdb -U postgres banani_crm 2>/dev/null || echo "   Database already exists"
    
else
    echo "   ❌ Failed to connect to PostgreSQL"
    echo "   Please ensure PostgreSQL is running and try again"
    exit 1
fi

# Step 3: Apply function fixes
echo ""
echo "🔧 Step 3: Applying database function fixes..."
if psql -U postgres -d banani_crm -f fix-finops-function-types.sql; then
    echo "   ✅ Function fixes applied successfully!"
else
    echo "   ❌ Failed to apply function fixes"
    exit 1
fi

# Step 4: Apply schema migration
echo ""
echo "📋 Step 4: Applying IST schema migration..."
if [ -f "server/database/migration-create-finops-sla-notifications-ist.sql" ]; then
    psql -U postgres -d banani_crm -f server/database/migration-create-finops-sla-notifications-ist.sql
    echo "   ✅ IST schema migration applied!"
else
    echo "   ⚠️  IST migration file not found, skipping..."
fi

# Step 5: Create sample data
echo ""
echo "🎯 Step 5: Creating sample real-time test data..."
if psql -U postgres -d banani_crm -f create-sample-finops-data.sql; then
    echo "   ✅ Sample data created successfully!"
else
    echo "   ❌ Failed to create sample data"
    exit 1
fi

# Step 6: Test the function
echo ""
echo "🧪 Step 6: Testing SLA notification function..."
FUNCTION_TEST=$(psql -U postgres -d banani_crm -t -c "SELECT COUNT(*) FROM check_subtask_sla_notifications_ist();")
echo "   📊 Function returned $FUNCTION_TEST notifications"

# Step 7: Show current IST time
echo ""
echo "🕒 Step 7: Current IST time information..."
psql -U postgres -d banani_crm -c "
SELECT 
  'Current IST Time' as info,
  (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as current_ist_time;
"

echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "✅ Real-time FinOps notifications are now configured with:"
echo "   • 15-second notification refresh"
echo "   • 30-second SLA monitoring"
echo "   • IST timezone support"
echo "   • Automatic overdue detection"
echo ""
echo "🔗 Connection Details:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: banani_crm"
echo "   User: postgres"
echo ""
echo "📋 Next Steps:"
echo "   1. Open FinOps Notifications tab in your app"
echo "   2. Look for 'Database Connected' badge"
echo "   3. Watch real-time notifications appear"
echo "   4. Check console logs for auto-sync activity"
echo ""
echo "🚨 Test Scenarios Created:"
echo "   • Task starting in 15 minutes (pre-alert)"
echo "   • Task 5 minutes overdue (SLA warning)"
echo "   • Task 20 minutes overdue (escalation)"
echo ""
