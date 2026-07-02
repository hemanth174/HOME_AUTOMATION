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


-- ============================================================
-- 7. MANUAL WALL SWITCH ACTIVITY LOGGING TRIGGER
-- ============================================================
-- Automatically log manual wall switch toggles when AC feedback changes
-- without a matching recent cloud command log.
CREATE OR REPLACE FUNCTION log_manual_ac_feedback()
RETURNS TRIGGER AS $$
DECLARE
    recent_log_exists boolean;
BEGIN
    IF (OLD.feedback_on IS DISTINCT FROM NEW.feedback_on) AND (NEW.feedback_on IS NOT NULL) THEN
        -- Check if there is a log in the last 5 seconds matching this device and action
        SELECT EXISTS (
            SELECT 1 FROM public.activity_logs
            WHERE device_id = NEW.id
              AND action = (CASE WHEN NEW.feedback_on = true THEN 'turned ON' ELSE 'turned OFF' END)
              AND created_at >= NOW() - INTERVAL '5 seconds'
        ) INTO recent_log_exists;

        -- If no matching recent log exists, it was flipped physically
        IF NOT recent_log_exists THEN
            INSERT INTO public.activity_logs (user_id, device_id, device_name, action, triggered_by)
            VALUES (
                NEW.user_id,
                NEW.id,
                NEW.name,
                CASE WHEN NEW.feedback_on = true THEN 'turned ON' ELSE 'turned OFF' END,
                'Manual Wall Switch'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_log_manual_ac_feedback
AFTER UPDATE ON public.devices
FOR EACH ROW
EXECUTE FUNCTION log_manual_ac_feedback();


-- ============================================================
-- 8. DAILY ANALYTICS TABLE, AGGREGATION & PRUNING
-- ============================================================

-- Daily Analytics: Consolidated summary table (1 row per user per day)
CREATE TABLE IF NOT EXISTS daily_analytics (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date            date NOT NULL,
    total_kwh       numeric NOT NULL DEFAULT 0,
    total_cost      numeric NOT NULL DEFAULT 0,
    avg_on_time     numeric NOT NULL DEFAULT 0, -- in hours
    device_shares   jsonb NOT NULL DEFAULT '{}', -- e.g. {"Light 1": 0.25, "Fan 2": 1.1}
    created_at      timestamptz DEFAULT now(),
    UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_analytics_user_date ON daily_analytics(user_id, date);

-- Enable RLS
ALTER TABLE daily_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own daily analytics" 
    ON daily_analytics FOR ALL 
    USING (auth.uid() = user_id);

-- Add to Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE daily_analytics;

-- Function to estimate device wattage based on name in PL/pgSQL
CREATE OR REPLACE FUNCTION get_device_wattage(device_name TEXT)
RETURNS NUMERIC AS $$
DECLARE
    n TEXT := lower(device_name);
BEGIN
    IF n LIKE '%ac%' OR n LIKE '%air conditioner%' THEN RETURN 1800;
    ELSIF n LIKE '%heater%' OR n LIKE '%geyser%' OR n LIKE '%boiler%' THEN RETURN 1500;
    ELSIF n LIKE '%pump%' OR n LIKE '%motor%' THEN RETURN 750;
    ELSIF n LIKE '%microwave%' OR n LIKE '%oven%' THEN RETURN 1200;
    ELSIF n LIKE '%fridge%' OR n LIKE '%refrigerator%' THEN RETURN 200;
    ELSIF n LIKE '%tv%' OR n LIKE '%television%' OR n LIKE '%computer%' OR n LIKE '%pc%' THEN RETURN 150;
    ELSIF n LIKE '%fan%' THEN RETURN 75;
    ELSIF n LIKE '%light%' OR n LIKE '%lamp%' OR n LIKE '%bulb%' THEN RETURN 12;
    ELSE RETURN 60;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate duration a device was ON during a specific date (in hours)
CREATE OR REPLACE FUNCTION calculate_device_run_time_hours(
    target_device_id UUID,
    target_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
    day_start TIMESTAMPTZ := target_date::timestamptz;
    day_end TIMESTAMPTZ := (target_date + 1)::timestamptz;
    log_rec RECORD;
    is_currently_on BOOLEAN := false;
    last_on_time TIMESTAMPTZ := NULL;
    total_ms NUMERIC := 0;
    calc_end TIMESTAMPTZ := LEAST(now(), day_end);
    first_action TEXT;
    prior_action TEXT;
BEGIN
    -- Determine state at day_start
    SELECT action INTO prior_action 
    FROM public.activity_logs 
    WHERE device_id = target_device_id 
      AND created_at < day_start 
    ORDER BY created_at DESC 
    LIMIT 1;

    IF prior_action IS NOT NULL THEN
        IF prior_action LIKE '%on%' OR prior_action LIKE '%activate%' THEN
            is_currently_on := true;
            last_on_time := day_start;
        END IF;
    ELSE
        SELECT action INTO first_action 
        FROM public.activity_logs 
        WHERE device_id = target_device_id 
          AND created_at >= day_start 
          AND created_at < day_end 
        ORDER BY created_at ASC 
        LIMIT 1;
        
        IF first_action IS NOT NULL AND (first_action LIKE '%off%' OR first_action LIKE '%deactivate%') THEN
            is_currently_on := true;
            last_on_time := day_start;
        END IF;
    END IF;

    -- Loop logs chronologically on target_date
    FOR log_rec IN 
        SELECT created_at, action 
        FROM public.activity_logs 
        WHERE device_id = target_device_id 
          AND created_at >= day_start 
          AND created_at < day_end 
        ORDER BY created_at ASC
    LOOP
        IF log_rec.action LIKE '%on%' OR log_rec.action LIKE '%activate%' THEN
            IF NOT is_currently_on THEN
                is_currently_on := true;
                last_on_time := log_rec.created_at;
            END IF;
        ELSE
            IF is_currently_on THEN
                is_currently_on := false;
                IF last_on_time IS NOT NULL THEN
                    total_ms := total_ms + EXTRACT(EPOCH FROM (log_rec.created_at - last_on_time)) * 1000;
                END IF;
                last_on_time := NULL;
            END IF;
        END IF;
    END LOOP;

    -- Handle final open interval if still ON at window end
    IF is_currently_on AND last_on_time IS NOT NULL THEN
        total_ms := total_ms + EXTRACT(EPOCH FROM (calc_end - last_on_time)) * 1000;
    END IF;

    RETURN GREATEST(0, total_ms / (1000.0 * 60.0 * 60.0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to summarize daily stats for all users for a given date
CREATE OR REPLACE FUNCTION summarize_daily_analytics(target_date DATE)
RETURNS VOID AS $$
DECLARE
    user_rec RECORD;
    device_rec RECORD;
    run_hours NUMERIC;
    device_wattage NUMERIC;
    device_kwh NUMERIC;
    total_kwh NUMERIC;
    total_cost NUMERIC;
    avg_on_time NUMERIC;
    device_count INTEGER;
    total_on_time NUMERIC;
    shares_jsonb JSONB;
BEGIN
    FOR user_rec IN SELECT DISTINCT user_id FROM public.devices LOOP
        total_kwh := 0;
        total_on_time := 0;
        device_count := 0;
        shares_jsonb := '{}'::jsonb;

        FOR device_rec IN 
            SELECT id, name 
            FROM public.devices 
            WHERE user_id = user_rec.user_id 
        LOOP
            run_hours := public.calculate_device_run_time_hours(device_rec.id, target_date);
            device_wattage := public.get_device_wattage(device_rec.name);
            device_kwh := (device_wattage * run_hours) / 1000.0;
            
            total_kwh := total_kwh + device_kwh;
            total_on_time := total_on_time + run_hours;
            device_count := device_count + 1;

            shares_jsonb := shares_jsonb || jsonb_build_object(device_rec.name, round(device_kwh::numeric, 4));
        END LOOP;

        IF device_count > 0 THEN
            avg_on_time := total_on_time / device_count;
        ELSE
            avg_on_time := 0;
        END IF;

        total_cost := total_kwh * 8.00;

        INSERT INTO public.daily_analytics (user_id, date, total_kwh, total_cost, avg_on_time, device_shares)
        VALUES (
            user_rec.user_id,
            target_date,
            round(total_kwh::numeric, 4),
            round(total_cost::numeric, 4),
            round(avg_on_time::numeric, 2),
            shares_jsonb
        )
        ON CONFLICT (user_id, date) DO UPDATE 
        SET total_kwh = EXCLUDED.total_kwh,
            total_cost = EXCLUDED.total_cost,
            avg_on_time = EXCLUDED.avg_on_time,
            device_shares = EXCLUDED.device_shares,
            created_at = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to prune activity logs and summarize analytics (called on page load)
CREATE OR REPLACE FUNCTION summarize_and_prune_old_logs()
RETURNS VOID AS $$
BEGIN
    -- Aggregate logs for current day and past two days to catch adjustments
    PERFORM public.summarize_daily_analytics(current_date);
    PERFORM public.summarize_daily_analytics(current_date - 1);
    PERFORM public.summarize_daily_analytics(current_date - 2);

    -- Prune logs older than 7 days
    DELETE FROM public.activity_logs 
    WHERE created_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
