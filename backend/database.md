-- 1. EXTENSIONS
-- These enable advanced features like auto-generating IDs and mapping locations.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. USERS TABLE
-- Tracks the "First Informants" (citizens reporting the incident).
-- This table is synced with Supabase Auth (auth.users) via database trigger.
CREATE TABLE IF NOT EXISTS public.users (
    user_id UUID NOT NULL DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE, -- Links to auth.users.id from Supabase Auth
    full_name TEXT NULL,
    email TEXT NULL,
    user_phone_number TEXT NOT NULL,
    date_of_birth TEXT NULL,
    date_registered TIMESTAMP WITH TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
    email_verified BOOLEAN DEFAULT false, -- Tracks if email is verified via OTP
    CONSTRAINT users_pkey PRIMARY KEY (user_id),
    CONSTRAINT users_phone_key UNIQUE (user_phone_number),
    CONSTRAINT users_email_key UNIQUE (email)
) TABLESPACE pg_default;

-- Function to sync auth.users to public.users when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, email, full_name, user_phone_number, date_of_birth, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'user_phone_number', ''),
    NEW.raw_user_meta_data->>'dateOfBirth',
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    email_verified = NEW.email_confirmed_at IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create public.users row when auth.users is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. RESPONDERS TABLE
-- Tracks the actual heroes (Police, Fire, Medical) on the ground.
CREATE TABLE IF NOT EXISTS public.responders (
    responder_id UUID NOT NULL DEFAULT gen_random_uuid(),
    name TEXT NULL,
    rank TEXT NULL,
    office TEXT NULL, -- e.g., "Makati Health Dept"
    responder_phone_number TEXT NOT NULL,
    service_type TEXT NOT NULL, -- 'fire', 'medical', or 'police'
    station_address TEXT NULL,
    
    -- Real-time Status and Location
    responder_location_lat NUMERIC NULL,
    responder_location_lng NUMERIC NULL,
    is_active BOOLEAN DEFAULT true, -- On duty vs. Off duty
    is_busy BOOLEAN DEFAULT false,  -- Currently in a mission vs. Free
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT responders_pkey PRIMARY KEY (responder_id),
    CONSTRAINT responders_phone_key UNIQUE (responder_phone_number),
    CONSTRAINT responders_service_check CHECK (service_type = ANY (ARRAY['fire', 'medical', 'police']))
) TABLESPACE pg_default;

-- Indices for faster searching during high-pressure emergencies
CREATE INDEX IF NOT EXISTS idx_responders_service_type ON public.responders USING btree (service_type);
CREATE INDEX IF NOT EXISTS idx_responders_active ON public.responders USING btree (is_active);

-- 4. INCIDENTS TABLE
-- The main log for every reported emergency.
CREATE TABLE IF NOT EXISTS public.incidents (
    incident_id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(user_id), -- Links back to the citizen who reported it
    user_phone_number TEXT NOT NULL,

    -- Incident location reported by the user
    incident_location_lat NUMERIC NOT NULL,
    incident_location_lng NUMERIC NOT NULL,
    location_address TEXT NULL,

    -- Optional link to the short-form video AI will analyze
    video_url TEXT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT incidents_pkey PRIMARY KEY (incident_id),
) TABLESPACE pg_default;

-- 5. AI ANALYSIS TABLE
-- Stores the "brain" results: what the AI thinks is happening.
CREATE TABLE IF NOT EXISTS public.ai_analysis (
    analysis_id UUID NOT NULL DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(incident_id) ON DELETE CASCADE,
    
    model_version TEXT DEFAULT 'eksena-ai-v1-mock',
    detected_service_type TEXT NULL, -- AI's suggestion: 'fire', 'medical', 'police', or 'false_report'
    confidence_score NUMERIC NULL,    -- How sure is the AI? (0.0 to 1.0)
    
    analysis_timestamp TIMESTAMP WITH TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
    CONSTRAINT ai_analysis_pkey PRIMARY KEY (analysis_id),
    CONSTRAINT ai_analysis_service_check CHECK (
      detected_service_type IS NULL OR detected_service_type = ANY (
        ARRAY['fire', 'medical', 'police', 'false_report']
      )
    )
) TABLESPACE pg_default;

-- 6. DISPATCH ASSIGNMENTS TABLE
-- This connects an Incident to a Responder (The "Dispatching" act).
CREATE TABLE IF NOT EXISTS public.dispatch (
    dispatch_id UUID NOT NULL DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(incident_id),
    responder_id UUID NOT NULL REFERENCES public.responders(responder_id),
    
    -- Timing metrics (to prove the <60s response goal)
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    dispatched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    arrived_at TIMESTAMP WITH TIME ZONE NULL,
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Dispatch pipeline: dispatched/assigned → in_progress → resolved
    status TEXT DEFAULT 'dispatched',
    CONSTRAINT dispatch_status_check CHECK (status = ANY (ARRAY['dispatched', 'in_progress', 'resolved'])),
    CONSTRAINT dispatch_assignments_pkey PRIMARY KEY (dispatch_id)
) TABLESPACE pg_default;

-- Seed example user corresponding to previous mock "Juan Manalo"
INSERT INTO public.users (full_name, email, user_phone_number, date_of_birth)
VALUES ('Juan Manalo', 'juan@example.com', '+1234567890', '1990-01-01')
ON CONFLICT (user_phone_number) DO NOTHING;