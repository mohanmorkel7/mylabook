# Database Setup Instructions

## Issue

The auto-sync functionality is failing with the error:

```
API request failed: Database unavailable - cannot perform auto-sync URL: /api/notifications-production/auto-sync
```

This happens because PostgreSQL database is not running on localhost:5432.

## Solution

### Option 1: Start Local PostgreSQL (Recommended)

```bash
# On Ubuntu/Debian
sudo systemctl start postgresql
sudo systemctl enable postgresql

# On macOS with Homebrew
brew services start postgresql

# On Windows
# Start PostgreSQL service from Services app or:
net start postgresql-x64-13  # (adjust version as needed)
```

### Option 2: Using Docker PostgreSQL

```bash
# Start a PostgreSQL container
docker run --name postgres-finops \
  -e POSTGRES_DB=banani_crm \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:13

# Check if running
docker ps
```

### Option 3: Configure Different Database

Update the environment variables in your `.env` file or server configuration:

```bash
PG_HOST=your_database_host
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_password
PG_DB=banani_crm
```

## Verification

After starting the database, check if the connection works:

```bash
# Test connection (if psql is available)
psql -h localhost -p 5432 -U postgres -d banani_crm -c "SELECT 1;"
```

## What Was Fixed

### 1. Removed Duplicate Auto-Sync Endpoints

- Found and removed duplicate `/auto-sync` endpoint in `server/routes/notifications-production.ts`
- This was causing routing conflicts

### 2. Improved Error Handling

- Enhanced error messages to be more informative
- Added graceful degradation when database is unavailable
- Client-side now handles 503 errors properly and doesn't spam failed requests

### 3. Better Logging

- Added clearer log messages for debugging
- Distinguished between critical and non-critical errors
- Added status indicators for database availability

## Expected Behavior After Fix

✅ **With Database Available:**

- Auto-sync runs every 30 seconds
- SLA notifications are created and updated in real-time
- Date picker filters work correctly
- Overdue reason popup functions properly

✅ **With Database Unavailable:**

- System gracefully falls back to mock data
- Auto-sync requests are handled without spamming errors
- User gets clear feedback about database status
- Application remains functional with limited features

## Testing the Fix

1. **Start the database** using one of the options above
2. **Refresh the application**
3. **Check the browser console** - should see:
   ```
   🔄 Auto-sync SLA check triggered...
   ✅ Database connected
   ```
4. **Verify notifications tab** shows real data instead of "Database Unavailable"

## Support

If you continue to have database connection issues:

1. Check if PostgreSQL is installed
2. Verify port 5432 is not blocked by firewall
3. Check database credentials in environment variables
4. Review server logs for specific connection errors
