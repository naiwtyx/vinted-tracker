-- ─────────────────────────────────────────────────────────────────
-- Vinted Tracker — ALTER TABLE (nouveaux champs)
-- À coller dans Supabase → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS categorie   TEXT NOT NULL DEFAULT 'Autre',
  ADD COLUMN IF NOT EXISTS date_achat  DATE,
  ADD COLUMN IF NOT EXISTS date_vente  DATE,
  ADD COLUMN IF NOT EXISTS photo_url   TEXT;


-- ─────────────────────────────────────────────────────────────────
-- Bucket Supabase Storage pour les photos
-- Option A : via le Dashboard (plus simple)
--   Storage → New bucket → Nom : "articles-photos" → Public : ✓
--
-- Option B : via SQL Editor (si tu veux tout faire en SQL)
-- ─────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('articles-photos', 'articles-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage : lecture + upload + suppression pour l'anon
CREATE POLICY "storage_anon_select" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'articles-photos');

CREATE POLICY "storage_anon_insert" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'articles-photos');

CREATE POLICY "storage_anon_delete" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'articles-photos');
