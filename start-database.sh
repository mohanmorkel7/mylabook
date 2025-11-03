#!/bin/bash

echo "🔄 Starting PostgreSQL and setting up database..."

# Start PostgreSQL service
if command -v brew &> /dev/null; then
    echo "📦 Starting PostgreSQL via Homebrew..."
    brew services start postgresql
elif command -v systemctl &> /dev/null; then
    echo "📦 Starting PostgreSQL via systemctl..."
    sudo systemctl start postgresql
elif command -v service &> /dev/null; then
    echo "📦 Starting PostgreSQL via service..."
    sudo service postgresql start
else
    echo "❌ Please start PostgreSQL manually"
    exit 1
fi

# Wait a moment for PostgreSQL to start
sleep 3

# Test connection
echo "🔍 Testing PostgreSQL connection..."
if psql -U postgres -c "SELECT 1;" &> /dev/null; then
    echo "✅ PostgreSQL is running!"
    
    # Create database if it doesn't exist
    echo "📊 Creating banani_crm database..."
    psql -U postgres -c "CREATE DATABASE banani_crm;" 2>/dev/null || echo "Database already exists"
    
    echo "🎉 Database setup complete!"
    echo "📋 Connection details:"
    echo "   Host: localhost"
    echo "   Port: 5432"
    echo "   Database: banani_crm"
    echo "   User: postgres"
    
else
    echo "❌ Failed to connect to PostgreSQL"
    echo "Please check:"
    echo "1. PostgreSQL is installed"
    echo "2. PostgreSQL is running"
    echo "3. User 'postgres' exists"
    exit 1
fi
