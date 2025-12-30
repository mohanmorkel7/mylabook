-- Migration: add product_master_ids JSONB column to workflow_projects
-- Date: 2025-12-01

ALTER TABLE workflow_projects
  ADD COLUMN IF NOT EXISTS product_master_ids JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_workflow_projects_product_master_ids ON workflow_projects USING gin (product_master_ids);
