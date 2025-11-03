# Database Setup Instructions

## PostgreSQL Setup

### Option 1: Local PostgreSQL Installation

1. Install PostgreSQL locally
2. Create a database named `banani_db`
3. Create a user with access to the database
4. Set the connection string in your environment

### Option 2: Using Docker (Recommended for Development)

```bash
# Start PostgreSQL in Docker
docker run --name banani-postgres \
  -e POSTGRES_DB=banani_db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:13

# Verify it's running
docker ps
```

### Option 3: Development without Database

The application is designed to work without a database connection for development purposes. If no database is available:

1. The server will continue to run but API calls will fail
2. The frontend will show loading states and error messages
3. You can still test the UI components and layouts

## Environment Variables

Create a `.env` file in the root directory:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/banani_db
NODE_ENV=development
```

## Database Schema

The database schema will be automatically created when the server starts. The schema includes:

- Users table with authentication
- Clients table for customer management
- Templates table for onboarding workflows
- Deployments table for product releases
- Products table for deployment targets

## Sample Data

The schema includes sample data for development:

- Default admin user: admin@banani.com / password
- Default sales user: sales@banani.com / password
- Default product user: product@banani.com / password
- Sample templates and products

## Running with Database

1. Start PostgreSQL (using one of the options above)
2. Run `npm run dev`
3. The database will be initialized automatically
4. Login with any of the default users to test the functionality

## API Endpoints

All API endpoints are available at `/api/*`:

- `/api/users` - User management
- `/api/clients` - Client management
- `/api/templates` - Template management
- `/api/deployments` - Deployment management

Each endpoint supports full CRUD operations (Create, Read, Update, Delete).
