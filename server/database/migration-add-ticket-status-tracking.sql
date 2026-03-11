-- Migration: Add ticket status tracking columns
-- This adds columns to track who made status changes and when

-- Add updated_by column to track who made the last update
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- Add in_progress_at timestamp for when ticket moved to In Progress
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMP;

-- Add in_progress_by column to track who moved ticket to In Progress
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS in_progress_by INTEGER REFERENCES users(id);

-- Add closed_by column to track who closed the ticket
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS closed_by INTEGER REFERENCES users(id);

-- Create indexes for these new columns
CREATE INDEX IF NOT EXISTS idx_tickets_updated_by ON tickets(updated_by);
CREATE INDEX IF NOT EXISTS idx_tickets_in_progress_by ON tickets(in_progress_by);
CREATE INDEX IF NOT EXISTS idx_tickets_closed_by ON tickets(closed_by);
CREATE INDEX IF NOT EXISTS idx_tickets_in_progress_at ON tickets(in_progress_at);
