# Database Not Running Issue

## Problem

The department upload is working with the JSON file but not updating the database because PostgreSQL is not running.

**Current Status:**

```
Database not available: connect ECONNREFUSED 127.0.0.1:5432
```

## Solutions

### Option 1: Start PostgreSQL Service

```bash
# On macOS with Homebrew
brew services start postgresql

# On Ubuntu/Debian
sudo systemctl start postgresql

# On Windows
net start postgresql
```

### Option 2: Start PostgreSQL with Docker

```bash
# Start a PostgreSQL container
docker run --name banani-postgres \
  -e POSTGRES_PASSWORD=password123 \
  -e POSTGRES_DB=banani_crm \
  -p 5432:5432 \
  -d postgres:13

# Check if running
docker ps
```

### Option 3: Check Database Connection Settings

The app expects PostgreSQL on:

- **Host:** localhost
- **Port:** 5432
- **Database:** banani_crm
- **User:** postgres
- **Password:** [as configured]

## Verify Database is Running

```bash
# Test connection
psql -h localhost -p 5432 -U postgres -d banani_crm

# Or check if port is listening
lsof -i :5432
```

## What Happens When Database Starts

1. ✅ Users with departments will be **updated** in database
2. ✅ Backend users: `Abinandan@mylapay.com`, `Abinaya.M@mylapay.com`
3. ✅ Admin user: `mohan.m@mylapay.com`
4. ✅ Role assignments will work correctly
5. ✅ Azure Role Assignment page will show proper groupings

## Expected Logs After Database Starts

```
🔄 Processing existing user for update: Abinandan@mylapay.com (has department: backend)
🔄 Processing existing user for update: Abinaya.M@mylapay.com (has department: backend)
🔄 Processing existing user for update: mohan.m@mylapay.com (has department: admin)
🔄 Updating existing user with department: Abinandan@mylapay.com (backend)
📊 Database sync summary: 0 new users, 3 updated users, 5 skipped users
```

**Once the database is running, try uploading your JSON again and the backend users should be properly updated!**
