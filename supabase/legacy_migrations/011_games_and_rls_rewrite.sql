-- 011：重寫 RLS（修正 profiles 無限遞迴）＋ 新增比賽（games）結構
--
-- 為什麼：舊的「Admins can view all profiles」policy 在 profiles 的 policy 裡又查詢 profiles，
-- Postgres 會回報 infinite recursion（42P17），導致讀不到角色。
-- 解法：用 SECURITY DEFINER 函式 has_role() 查角色，函式本身不受 RLS 限制，因此不會遞迴。
--
-- 可重複執行（idempotent）。請在 Supabase Dashboard → SQL Editor 整份貼上執行。

-- ============================================
-- 1. 角色判斷函式
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = ANY (roles)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(TEXT[]) TO authenticated;

-- ============================================
-- 2. 比賽相關資料表
-- ============================================

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opponent TEXT NOT NULL,
  home_away TEXT NOT NULL DEFAULT 'home' CHECK (home_away IN ('home', 'away')),
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'final')),
  our_score INTEGER CHECK (our_score >= 0),
  opp_score INTEGER CHECK (opp_score >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 打序：每場比賽每個棒次一位球員，換人（代打）直接覆寫該棒次
CREATE TABLE IF NOT EXISTS game_lineups (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  batting_order INTEGER NOT NULL CHECK (batting_order BETWEEN 1 AND 20),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, batting_order)
);

ALTER TABLE atbats ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE atbats ADD COLUMN IF NOT EXISTS inning INTEGER CHECK (inning BETWEEN 1 AND 30);
ALTER TABLE atbats ADD COLUMN IF NOT EXISTS batting_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_games_game_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_atbats_game_id ON atbats(game_id);

-- ============================================
-- 3. 清掉舊 policies，全部重建
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE atbats ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_lineups ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'players', 'atbats', 'games', 'game_lineups')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (id = auth.uid() OR public.has_role(ARRAY['admin']));
CREATE POLICY "profiles_insert_self_viewer" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid() AND role = 'viewer');
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (public.has_role(ARRAY['admin']));

-- players
CREATE POLICY "players_select" ON players FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
CREATE POLICY "players_insert" ON players FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "players_update" ON players FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "players_delete" ON players FOR DELETE
  USING (public.has_role(ARRAY['admin']));

-- atbats（editor 也能刪除，才能在比賽中即時修正按錯的打席）
CREATE POLICY "atbats_select" ON atbats FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
CREATE POLICY "atbats_insert" ON atbats FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "atbats_update" ON atbats FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "atbats_delete" ON atbats FOR DELETE
  USING (public.has_role(ARRAY['editor', 'admin']));

-- games
CREATE POLICY "games_select" ON games FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
CREATE POLICY "games_insert" ON games FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "games_update" ON games FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "games_delete" ON games FOR DELETE
  USING (public.has_role(ARRAY['admin']));

-- game_lineups
CREATE POLICY "game_lineups_select" ON game_lineups FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
CREATE POLICY "game_lineups_insert" ON game_lineups FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "game_lineups_update" ON game_lineups FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "game_lineups_delete" ON game_lineups FOR DELETE
  USING (public.has_role(ARRAY['editor', 'admin']));

-- ============================================
-- 4. 使用者列表函式：原本任何登入者都能讀到所有人的 email，加上 admin 檢查
-- ============================================

CREATE OR REPLACE FUNCTION public.get_users_with_profiles()
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, COALESCE(u.email::TEXT, ''), p.role, p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON p.id = u.id
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_with_profiles() TO authenticated;
