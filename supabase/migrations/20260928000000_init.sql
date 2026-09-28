-- Baseball Keep 完整資料庫結構（整合自 legacy_migrations/001–011 的最終狀態）
-- 新的 Supabase 專案只需要這一個 migration。

-- ============================================
-- 資料表
-- ============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同名同背號不可重複（背號為空時，同名也不可重複）
CREATE UNIQUE INDEX players_name_number_unique ON players (name, COALESCE(number, ''));

CREATE TABLE games (
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
CREATE TABLE game_lineups (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  batting_order INTEGER NOT NULL CHECK (batting_order BETWEEN 1 AND 20),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, batting_order)
);

CREATE TABLE atbats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  inning INTEGER CHECK (inning BETWEEN 1 AND 30),
  batting_order INTEGER,
  contacted BOOLEAN NOT NULL DEFAULT false,
  no_contact TEXT,
  quality TEXT,
  result TEXT,
  out_type TEXT CHECK (out_type IN ('flyout', 'groundout', 'double_play', 'triple_play')),
  rbi INTEGER DEFAULT 0,
  hit_x FLOAT CHECK (hit_x >= 0 AND hit_x <= 100),
  hit_y FLOAT CHECK (hit_y >= 0 AND hit_y <= 100),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atbats_player_id ON atbats(player_id);
CREATE INDEX idx_atbats_game_id ON atbats(game_id);
CREATE INDEX idx_games_game_date ON games(game_date);

-- ============================================
-- 角色判斷（SECURITY DEFINER，避免 profiles policy 自我查詢造成無限遞迴）
-- ============================================

CREATE FUNCTION public.has_role(roles TEXT[])
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
-- 註冊時自動建立 profile（預設 viewer）
-- ============================================

CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 使用者列表（含 email），僅限 admin
-- ============================================

CREATE FUNCTION public.get_users_with_profiles()
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
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

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE atbats ENABLE ROW LEVEL SECURITY;

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

-- atbats（editor 也能刪除，才能在比賽中即時修正按錯的打席）
CREATE POLICY "atbats_select" ON atbats FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
CREATE POLICY "atbats_insert" ON atbats FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "atbats_update" ON atbats FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']));
CREATE POLICY "atbats_delete" ON atbats FOR DELETE
  USING (public.has_role(ARRAY['editor', 'admin']));
