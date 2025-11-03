# Database Setup Guide - Switch from Mock Data to Real-Time Database

## Current Status

Your application is currently using **mock data** because the database connection is not available. All endpoints are falling back to mock data.

## Quick Database Status Check

Visit: `http://localhost:8080/api/database/status` to see current database connection status and which endpoints are using mock vs real data.

## Setup Options

### Option 1: Local PostgreSQL Installation

#### Install PostgreSQL locally:

```bash
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# Windows
# Download from https://www.postgresql.org/download/windows/
```

#### Create database:

```sql
sudo -u postgres psql
CREATE DATABASE crm_dev;
CREATE USER postgres WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE crm_dev TO postgres;
\q
```

### Option 2: Docker PostgreSQL (if Docker available)

```bash
docker run --name crm_postgres -e POSTGRES_DB=crm_dev -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15
```

### Option 3: Cloud Database (Recommended for Production)

- **Supabase**: https://supabase.com (Free tier available)
- **Railway**: https://railway.app (PostgreSQL hosting)
- **Heroku Postgres**: https://www.heroku.com/postgres
- **AWS RDS**: https://aws.amazon.com/rds/

## Environment Configuration

Set these environment variables (already configured in your dev server):

```
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=password
PG_DB=crm_dev
```

## Current Endpoint Status

### Endpoints with Mock Data Fallback:

- `/api/leads` - ✅ Ready for database
- `/api/vc` - ✅ Ready for database
- `/api/follow-ups` - ✅ Ready for database
- `/api/users` - ✅ Ready for database
- `/api/clients` - ✅ Ready for database
- `/api/templates` - ✅ Ready for database
- `/api/tickets` - ✅ Ready for database

### Production Endpoints (Database-Only):

- `/api/leads-production` - 🔴 Requires database
- `/api/templates-production` - 🔴 Requires database
- `/api/activity-production` - 🔴 Requires database
- `/api/notifications-production` - 🔴 Requires database
- `/api/admin` - 🔴 Requires database
- `/api/finops-production` - 🔴 Requires database

## Verification Steps

1. **Check database status**: `GET /api/database/status`
2. **Test connection**: `POST /api/database/test`
3. **Force reconnect**: `POST /api/database/reconnect`

## Database Schema

The application will automatically initialize the database schema when a connection is established, including:

- User management tables
- Lead and VC tracking
- Follow-up system
- Template management
- Activity logs
- Notifications

## What Changes When Database is Connected

### Before (Mock Data):

- Data resets on server restart
- Limited test data available
- No persistence across sessions
- Production endpoints unavailable

### After (Real Database):

- ✅ Persistent data storage
- ✅ Real-time updates across users
- ✅ Full CRUD operations
- ✅ Production endpoints available
- ✅ Data integrity and relationships
- ✅ Advanced querying and filtering
- ✅ Audit trails and activity logs

## Next Steps

1. Choose your database setup option above
2. Restart the dev server after database is running
3. Check `/api/database/status` to confirm connection
4. All endpoints will automatically switch to real-time database data!

## Troubleshooting

### Connection Issues:

- Verify PostgreSQL is running: `pg_isready`
- Check port availability: `netstat -an | grep 5432`
- Test direct connection: `psql -h localhost -U postgres -d crm_dev`

### Permission Issues:

- Ensure user has database privileges
- Check authentication method in `pg_hba.conf`

### Schema Issues:

The application will automatically initialize the schema, but you can manually run:

```sql
-- Connect to your database and run the schema files in server/database/
```
