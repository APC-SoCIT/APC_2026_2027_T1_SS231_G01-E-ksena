-- Run this in Supabase SQL Editor if you get "null value in column user_id/incident_id" or "violates foreign key constraint".
-- This allows reports to be saved without a linked user or incident.

ALTER TABLE reports
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE reports
  ALTER COLUMN incident_id DROP NOT NULL;
