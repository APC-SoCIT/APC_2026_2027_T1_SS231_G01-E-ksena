-- Run this in Supabase SQL Editor so the app can store report text (Title + Details).
-- Your table has: report_id, classified_as, report_location_lat, report_location_lng, timestamp, video_path, bucket_id, is_processed
-- This adds a "content" column for the report body.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS content TEXT;
