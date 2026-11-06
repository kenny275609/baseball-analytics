-- 防守紀錄
--
-- game_defense：這場比賽目前每個守備位置是誰（1 投手 … 9 右外野、10 自由手）
-- defense_plays：對手每個打席的結果與守備路徑
--   path：經手野手的位置編號，依傳球順序（6-4-3 = {6,4,3}）；三振沒點路徑時存 {2}
--   path_players：記錄當下 path 各位置上的球員（和 path 對齊，沒排人為 null），
--                 之後換守備位置不會改到已記錄的刺殺 / 助殺
--   client_id：前端產生，重送同一筆時不會重複寫入
--
-- 沒執行這個 migration 時比賽頁照常使用，防守頁會提示需要先執行 migration。
-- 全部 idempotent，可重複執行；只新增資料表，不改動既有資料。

CREATE TABLE IF NOT EXISTS public.game_defense (
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, position)
);

-- 一位球員同時只能守一個位置
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_defense_game_player
  ON public.game_defense(game_id, player_id);

CREATE TABLE IF NOT EXISTS public.defense_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  client_id UUID UNIQUE,
  inning INTEGER NOT NULL CHECK (inning BETWEEN 1 AND 30),
  result TEXT NOT NULL CHECK (result IN (
    'strikeout', 'groundout', 'flyout', 'double_play', 'triple_play', 'fielders_choice',
    'sacrifice', 'sacrifice_fly', 'other_out',
    'single', 'double', 'triple', 'homerun', 'walk', 'hit_by_pitch', 'error'
  )),
  path INTEGER[] NOT NULL DEFAULT '{}',
  path_players UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT defense_plays_path_len CHECK (
    coalesce(array_length(path, 1), 0) <= 8
    AND coalesce(array_length(path, 1), 0) = coalesce(array_length(path_players, 1), 0)
  ),
  CONSTRAINT defense_plays_path_positions CHECK (path <@ ARRAY[1,2,3,4,5,6,7,8,9,10])
);

CREATE INDEX IF NOT EXISTS idx_defense_plays_game_id
  ON public.defense_plays(game_id, created_at);

ALTER TABLE public.game_defense ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defense_plays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_defense_select" ON public.game_defense;
CREATE POLICY "game_defense_select" ON public.game_defense FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
DROP POLICY IF EXISTS "game_defense_insert" ON public.game_defense;
CREATE POLICY "game_defense_insert" ON public.game_defense FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "game_defense_update" ON public.game_defense;
CREATE POLICY "game_defense_update" ON public.game_defense FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']))
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "game_defense_delete" ON public.game_defense;
CREATE POLICY "game_defense_delete" ON public.game_defense FOR DELETE
  USING (public.has_role(ARRAY['editor', 'admin']));

DROP POLICY IF EXISTS "defense_plays_select" ON public.defense_plays;
CREATE POLICY "defense_plays_select" ON public.defense_plays FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
DROP POLICY IF EXISTS "defense_plays_insert" ON public.defense_plays;
CREATE POLICY "defense_plays_insert" ON public.defense_plays FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "defense_plays_delete" ON public.defense_plays;
CREATE POLICY "defense_plays_delete" ON public.defense_plays FOR DELETE
  USING (public.has_role(ARRAY['editor', 'admin']));

NOTIFY pgrst, 'reload schema';
