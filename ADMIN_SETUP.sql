-- ============================================
-- ADMIN PANEL TABLES SETUP
-- Execute these in Supabase SQL Editor
-- ============================================

-- 1. ADMIN USERS TABLE
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  totp_secret VARCHAR,
  two_fa_enabled BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 2. WORKERS TABLE
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  user_id VARCHAR UNIQUE NOT NULL,
  shift VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'active',
  bank_account VARCHAR,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 3. BOT INSTANCES TABLE
CREATE TABLE bot_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  bot_type VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'running',
  last_started TIMESTAMP,
  last_stopped TIMESTAMP,
  error_count INT DEFAULT 0,
  uptime_seconds INT DEFAULT 0,
  last_heartbeat TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 4. INSERT DEFAULT ADMIN USERS
INSERT INTO admin_users (email, password_hash, totp_secret, two_fa_enabled)
VALUES 
  ('willy@918pay.local', 'TEMP_PASSWORD_HASH_1', NULL, true),
  ('operator908@918pay.local', 'TEMP_PASSWORD_HASH_2', NULL, true);

-- 5. INSERT EXISTING WORKERS
INSERT INTO workers (name, user_id, shift, status)
VALUES 
  ('Xiaoting', 'xiaoting99', 'pagi', 'active'),
  ('Yaer', 'yaer98', 'siang', 'active'),
  ('Anan', 'anan88', 'malam', 'active');

-- 6. CREATE BOT INSTANCES FOR EXISTING WORKERS
INSERT INTO bot_instances (worker_id, bot_type, status)
SELECT id, 'worker', 'running' FROM workers WHERE user_id IN ('xiaoting99', 'yaer98', 'anan88');

-- 7. ENABLE ROW LEVEL SECURITY (Optional but recommended)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_instances ENABLE ROW LEVEL SECURITY;

-- 8. CREATE RLS POLICIES (Allow all for now - tighten later)
-- Note: These are permissive for MVP. Tighten in production.

CREATE POLICY "Allow all on workers"
  ON workers FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on bot_instances"
  ON bot_instances FOR ALL
  USING (true) WITH CHECK (true);

COMMIT;