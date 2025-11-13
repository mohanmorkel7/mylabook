# Timestamp-Based Email Processing Implementation (Option B)

## Problem
The email processing job was running every minute and creating duplicate tickets because:
1. All emails from today were being re-processed each run
2. No tracking of when emails were last processed per config
3. This caused the same email to create multiple tickets

## Solution
Implemented timestamp-based email processing where:
1. Each mail config tracks when it was last processed (`last_processed_at`)
2. The scheduler only fetches emails since that timestamp for each config
3. After successful processing, the timestamp is updated
4. This prevents duplicate processing without relying on unique constraints alone

## Changes Made

### 1. Database Schema
**File**: `server/database/add-last-processed-at.sql`
- Added `last_processed_at TIMESTAMP DEFAULT NULL` column to `mail_configs` table
- Created index `idx_mail_configs_last_processed` for efficient filtering

### 2. Data Model
**File**: `server/models/MailConfig.ts`
- Updated `MailConfig` interface to include `last_processed_at?: string | null`
- Updated all queries (findAll, findById, getActiveConfigs, create, update) to SELECT/RETURN last_processed_at
- Added new method `updateLastProcessedAt(configId, timestamp)` to update the timestamp after processing

### 3. Email Processing Service
**File**: `server/services/emailProcessorService.ts`
- Modified `getTodayEmails(since?: Date)` to accept optional `since` parameter
- When `since` is provided, only fetches emails after that timestamp
- Updated `parseGraphEmails()` to use filter dates correctly
- Keeps backward compatibility - if no `since` provided, fetches from start of today

### 4. Email Processing Job
**File**: `server/jobs/emailProcessingJob.ts`
- Completely restructured to process each config independently
- For each active config:
  1. Gets the config's `last_processed_at` timestamp
  2. Fetches emails since that timestamp using `getTodayEmails(since)`
  3. Filters emails matching the config criteria
  4. Processes matched emails
  5. Updates `last_processed_at` to current time
- Removed old global email fetch and all-at-once processing
- Each config is processed independently with its own timestamp

### 5. Migration Script
**File**: `apply-last-processed-at-migration.js`
- ES module based migration script
- Applies the schema changes to the database
- Can be run manually if needed: `node apply-last-processed-at-migration.js`

## How It Works

### Before (Old Approach)
```
Every 1 minute:
  1. Fetch all emails from today
  2. For each config:
     - Check if email matches config
     - Create ticket
  3. Process all at once
  
Result: Same email processed multiple times per minute = Duplicates!
```

### After (New Approach)
```
Every 1 minute:
  For each config independently:
    1. Check config.last_processed_at (e.g., "2025-11-13 10:00:00")
    2. Fetch emails since that time
    3. Filter emails matching this config
    4. Create tickets for matches
    5. Update config.last_processed_at = NOW()
    
Result: Each config only processes new emails since last run = No duplicates!
```

## Key Benefits

1. **No Duplicate Tickets**: Each email is processed only once per config
2. **Efficient**: Only fetches new emails instead of all emails each run
3. **Per-Config Tracking**: Each config has its own processing timeline
4. **Atomic Updates**: Timestamps updated after successful processing
5. **Backward Compatible**: If last_processed_at is NULL, uses start of today

## Testing Checklist

- [ ] Run migration: `node apply-last-processed-at-migration.js`
- [ ] Restart dev server: `npm run dev`
- [ ] Verify email processing job runs with new logic
- [ ] Check that tickets are created only once per email
- [ ] Verify last_processed_at is updated after each run
- [ ] Monitor logs for successful email processing

## Migration Steps

1. **Apply Database Schema**:
   ```bash
   node apply-last-processed-at-migration.js
   ```

2. **Restart Dev Server**:
   ```bash
   npm run dev
   ```

3. **Monitor Logs**:
   Watch for email processing job logs showing per-config processing

## Rollback (if needed)

If you need to revert, drop the column:
```sql
ALTER TABLE mail_configs DROP COLUMN IF EXISTS last_processed_at;
DROP INDEX IF EXISTS idx_mail_configs_last_processed;
```

Then restart to old code.
