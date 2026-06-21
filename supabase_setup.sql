-- ============================================================
-- SMART HOME AUTOMATION — SUPABASE DATABASE SETUP
-- ============================================================
-- Run this ENTIRE script in your Supabase SQL Editor:
--   Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- BEFORE RUNNING:
-- 1. Create a free Supabase project at https://supabase.com
-- 2. Go to Project Settings → API → copy "Project URL" and "anon public" key
-- 3. Paste those values into esp.js (SUPABASE_URL and SUPABASE_ANON_KEY)
--
-- AFTER RUNNING:
-- 1. Go to Authentication → Providers → Email → ensure "Enable Email Signup" is ON
-- 2. (Optional) For development: Authentication → Settings → disable "Enable email confirmations"
-- ============================================================


-- ============================================================
-- 1. TABLES
-- ============================================================

-- Boards: Each physical ESP32 module
CREATE TABLE IF NOT EXISTS boards (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    board_identifier text NOT NULL,
    name            text NOT NULL DEFAULT 'New Board',
    created_at      timestamptz DEFAULT now()
);

ALTER TABLE boards
    ADD CONSTRAINT unique_board_per_user UNIQUE (user_id, board_identifier);


-- Devices: Each relay output on a board (4 per board, index 0-3)
CREATE TABLE IF NOT EXISTS devices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    board_id        uuid REFERENCES boards(id)     ON DELETE CASCADE NOT NULL,
    relay_index     integer NOT NULL CHECK (relay_index >= 0 AND relay_index <= 3),
    name            text NOT NULL DEFAULT 'Device',
    is_on           boolean NOT NULL DEFAULT false,
    feedback_on     boolean DEFAULT null,
    last_changed    timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);

ALTER TABLE devices
    ADD CONSTRAINT unique_relay_per_board UNIQUE (board_id, relay_index);


-- Schedules: Recurring on/off actions
CREATE TABLE IF NOT EXISTS schedules (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id)  ON DELETE CASCADE NOT NULL,
    device_id       uuid REFERENCES devices(id)     ON DELETE CASCADE NOT NULL,
    action          boolean NOT NULL,
    time            time NOT NULL,
    days            integer[] NOT NULL,
    enabled         boolean DEFAULT true,
    created_at      timestamptz DEFAULT now()
);


-- Alarms: One-time triggers
CREATE TABLE IF NOT EXISTS alarms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id)  ON DELETE CASCADE NOT NULL,
    device_id       uuid REFERENCES devices(id)     ON DELETE CASCADE NOT NULL,
    action          boolean NOT NULL,
    trigger_at      timestamptz NOT NULL,
    fired           boolean DEFAULT false,
    created_at      timestamptz DEFAULT now()
);


-- Presets: Custom device state combinations (e.g. "Party Mode", "Night Mode")
CREATE TABLE IF NOT EXISTS presets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name            text NOT NULL,
    actions         jsonb NOT NULL DEFAULT '[]',
    created_at      timestamptz DEFAULT now()
);


-- Activity Logs: Historical log of relay state changes
CREATE TABLE IF NOT EXISTS activity_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_id       uuid REFERENCES devices(id) ON DELETE SET NULL,
    device_name     text NOT NULL,
    action          text NOT NULL,
    triggered_by    text NOT NULL,
    created_at      timestamptz DEFAULT now()
);


-- ============================================================
-- 2. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_boards_user     ON boards(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user    ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_board   ON devices(board_id);
CREATE INDEX IF NOT EXISTS idx_schedules_user  ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_alarms_user     ON alarms(user_id);
CREATE INDEX IF NOT EXISTS idx_alarms_trigger  ON alarms(trigger_at) WHERE fired = false;
CREATE INDEX IF NOT EXISTS idx_presets_user    ON presets(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);


-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE boards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE presets   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own boards"
    ON boards FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own devices"
    ON devices FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own schedules"
    ON schedules FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own alarms"
    ON alarms FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own presets"
    ON presets FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own activity logs"
    ON activity_logs FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 4. REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE devices;
ALTER PUBLICATION supabase_realtime ADD TABLE alarms;
ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE boards;
ALTER PUBLICATION supabase_realtime ADD TABLE presets;


-- ============================================================
-- 5. SECURITY PROFILES (FOR PASSWORD RESET)
-- ============================================================
CREATE TABLE IF NOT EXISTS security_profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    q1 text NOT NULL,
    a1 text NOT NULL,
    q2 text NOT NULL,
    a2 text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_profiles_email ON security_profiles(email);

ALTER TABLE security_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own security profile"
    ON security_profiles FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Secure function to check answers without exposing them to the client
CREATE OR REPLACE FUNCTION verify_security_answers(p_email text, p_a1 text, p_a2 text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with admin privileges to bypass RLS for verification
AS $$
DECLARE
    is_valid boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM security_profiles 
        WHERE lower(trim(email)) = lower(trim(p_email))
        AND lower(trim(a1)) = lower(trim(p_a1)) 
        AND lower(trim(a2)) = lower(trim(p_a2))
    ) INTO is_valid;
    RETURN is_valid;
END;
$$;

-- Secure function to insert profile during signup (since user might not be logged in yet)
CREATE OR REPLACE FUNCTION create_security_profile(p_user_id uuid, p_email text, p_q1 text, p_a1 text, p_q2 text, p_a2 text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only insert if it doesn't already exist to prevent abuse
    IF NOT EXISTS (SELECT 1 FROM security_profiles WHERE user_id = p_user_id) THEN
        INSERT INTO security_profiles(user_id, email, q1, a1, q2, a2)
        VALUES (p_user_id, lower(trim(p_email)), p_q1, trim(p_a1), p_q2, trim(p_a2));
    END IF;
END;
$$;

-- Secure function to get security questions for an email
CREATE OR REPLACE FUNCTION get_security_questions(p_email text)
RETURNS TABLE (q1 text, q2 text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY 
    SELECT s.q1, s.q2 
    FROM security_profiles s
    WHERE lower(trim(s.email)) = lower(trim(p_email))
    LIMIT 1;
END;
$$;


-- ============================================================
-- 6. AUTO-PURGE ACTIVITY LOGS (RETAIN 7 DAYS)
-- ============================================================
-- To automatically delete activity logs older than 7 days,
-- you can run the following SQL command to enable a pg_cron job in Supabase:
--
-- create extension if not exists pg_cron;
-- select cron.schedule(
--     'purge-activity-logs',
--     '0 0 * * *', -- run daily at midnight
--     $$ DELETE FROM public.activity_logs WHERE created_at < NOW() - INTERVAL '7 days' $$
-- );
