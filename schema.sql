-- ─────────────────────────────────────────────────────────
-- Vinted Tracker — Schema Supabase
-- À coller dans : Supabase Dashboard → SQL Editor → New query
-- ─────────────────────────────────────────────────────────

-- 1. Table principale
CREATE TABLE articles (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom          TEXT           NOT NULL,
  prix_achat   NUMERIC(10, 2) NOT NULL,
  prix_vente   NUMERIC(10, 2) NOT NULL,
  frais_vinted NUMERIC(10, 2),           -- NULL = calcul auto côté client
  statut       TEXT           NOT NULL DEFAULT 'en stock'
                              CHECK (statut IN ('en stock', 'vendu')),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 2. Index pour trier par date (requête principale)
CREATE INDEX articles_created_at_idx ON articles (created_at DESC);

-- 3. Row Level Security (obligatoire avec la clé anon publique)
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Permet toutes les opérations à l'utilisateur anonyme
-- (accès non authentifié depuis GitHub Pages)
CREATE POLICY "acces_anon_complet" ON articles
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
