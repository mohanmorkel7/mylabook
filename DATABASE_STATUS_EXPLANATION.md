# Database Status and Lead Steps Behavior

## Current Situation

The application is currently using **mock data** for lead steps because the PostgreSQL database is not available in this environment.

### Evidence from Server Logs:

```
Database not available: connect ECONNREFUSED 127.0.0.1:5432
```

This means:

- The app attempts to connect to PostgreSQL at `localhost:5432`
- Connection fails, so it gracefully falls back to mock data
- This is **expected behavior** and the app is working correctly

## Lead Steps API Behavior

The `/api/leads/:leadId/steps` endpoint follows this logic:

1. **Try Database First**:

   - Check if database is available
   - Get lead's template_id
   - Fetch existing lead_steps or create them from template_steps
   - Include probability_percent from database

2. **Fallback to Mock Data**:
   - If database unavailable, use `MockDataService.getLeadSteps(leadId)`
   - Mock data includes probability_percent values: 20%, 25%, 30%, 15%, 10%, etc.
   - This ensures the app continues to work for development/testing

## Template Steps in "Add New Step" Modal

The Steps Overview now correctly shows:

- **Template steps** from `/api/templates-production/:id` endpoint
- Each step with its probability_percent value
- Real-time totals and 100% validation
- Falls back to mock template data when database unavailable

## To Use Real Database Data

To switch from mock data to real database data:

1. **Start PostgreSQL Server**:

   ```bash
   # On local development
   pg_ctl start -D /usr/local/var/postgres
   # Or with Docker
   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres
   ```

2. **Run Database Migration**:

   ```bash
   node server/database/migrate-probability-fields.js
   ```

3. **Verify Connection**:

   ```bash
   node server/check-probability-field.js
   ```

4. **Test API**:
   ```bash
   node test-template-steps.js
   ```

## Current Mock Data

The mock data includes:

### Lead Steps (for lead ID 1):

- Initial Contact & Discovery: 20%
- Needs Assessment & Demo: 25%
- Proposal Preparation: 30%
- Proposal Review & Negotiation: 15%
- Contract Finalization: 10%
- Total: 100%

### Template Steps:

- Template 1: 5 steps totaling 100%
- Template 2: 8 steps totaling 100%
- Template 3: 3 steps totaling 100%

## Summary

✅ **Lead steps showing mock data is correct behavior** - database is not available
✅ **Template steps in "Add New Step" modal** now show template data correctly
✅ **Probability percentages** are included in both mock and database implementations
✅ **Fallback mechanism** ensures app works in all environments

The application is working as designed!
