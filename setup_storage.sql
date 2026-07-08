-- =============================================================
-- SQL: Setup Storage + RLS untuk chat_images bucket
-- Jalanin ini di Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/mfuqwfpnzylosqfmmuic/sql/new
-- =============================================================

-- 1. Create bucket (public)
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('chat_images', 'chat_images', true, false, 5242880, '{image/png,image/jpeg,image/gif,image/webp}')
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Allow public SELECT (view images)
CREATE POLICY "chat_images_public_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat_images');

-- 3. Allow anon INSERT (upload images)
CREATE POLICY "chat_images_anon_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat_images');

-- 4. Allow UPDATE (overwrite)
CREATE POLICY "chat_images_anon_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'chat_images')
WITH CHECK (bucket_id = 'chat_images');

-- 5. Allow DELETE
CREATE POLICY "chat_images_anon_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat_images');

-- =============================================================
-- Optional: fungsi untuk insert message + upload sekaligus
-- =============================================================
CREATE OR REPLACE FUNCTION insert_chat_message(
  p_username TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'user',
  p_room TEXT DEFAULT 'worker'
) RETURNS UUID AS $$
  INSERT INTO messages (username, message, type, room)
  VALUES (p_username, p_message, p_type, p_room)
  RETURNING id;
$$ LANGUAGE sql SECURITY DEFINER;
