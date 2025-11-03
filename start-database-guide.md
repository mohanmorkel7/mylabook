# Database Connection Fix Guide

## The Issue

The application is showing "Failed to fetch" errors because the PostgreSQL database is not running on localhost:5432.

## Quick Fixes

### Option 1: Start PostgreSQL (Recommended)

```bash
# On macOS with Homebrew
brew services start postgresql

# On Ubuntu/Debian
sudo service postgresql start
# or
sudo systemctl start postgresql

# On Windows
# Start PostgreSQL service from Services.msc
# or use PostgreSQL application launcher
```

### Option 2: Check if PostgreSQL is installed

```bash
# Check if PostgreSQL is installed
psql --version

# If not installed on macOS:
brew install postgresql

# If not installed on Ubuntu/Debian:
sudo apt update
sudo apt install postgresql postgresql-contrib

# If not installed on Windows:
# Download from https://www.postgresql.org/download/windows/
```

### Option 3: Create Database and User

```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# Create database and user
CREATE DATABASE banani_crm;
CREATE USER postgres WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE banani_crm TO postgres;
\q
```

### Option 4: Use Docker (Alternative)

```bash
# Run PostgreSQL in Docker
docker run --name postgres-db \
  -e POSTGRES_DB=banani_crm \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:13

# Check if container is running
docker ps
```

## Environment Variables

The application expects these default values:

- **Host:** localhost
- **Port:** 5432
- **Database:** banani_crm
- **User:** postgres
- **Password:** password

You can override these with environment variables:

```bash
export PG_HOST=localhost
export PG_PORT=5432
export PG_DB=banani_crm
export PG_USER=postgres
export PG_PASSWORD=password
```

## Test Connection

```bash
# Test if database is accessible
psql -h localhost -p 5432 -U postgres -d banani_crm -c "SELECT 1;"
```

## Verify Fix

1. Start/restart your development server: `npm run dev`
2. Open the application and check for the green "Database Connected" status
3. The API errors should be resolved

## Still Having Issues?

- Check PostgreSQL logs: `tail -f /usr/local/var/log/postgres.log` (macOS)
- Verify port 5432 is not in use: `lsof -i :5432`
- Check firewall settings
- Ensure PostgreSQL is accepting connections in `postgresql.conf`
