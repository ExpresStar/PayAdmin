-- ============================================
-- ADMIN SETUP v2 — FIX (skip existing tables)
-- ============================================

-- 1. BUAT TABLE SHIFT SWAPS (kalo belum ada)
CREATE TABLE IF NOT EXISTS shift_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_from UUID REFERENCES workers(id) ON DELETE CASCADE,
  request_to UUID REFERENCES workers(id) ON DELETE CASCADE,
  swap_date DATE NOT NULL,
  notes TEXT,
  status VARCHAR DEFAULT 'pending',
  admin_approver VARCHAR,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 2. ENABLE RLS
ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICY (buka sementara)
CREATE POLICY "Allow all on shift_swaps" ON shift_swaps
  FOR ALL USING (true) WITH CHECK (true);

-- 4. DAFTARKAN SHIFT_SWAPS KE REALTIME
-- (tabel lain sudah terdaftar sebelumnya)
ALTER PUBLICATION supabase_realtime ADD TABLE shift_swaps;

COMMIT;
