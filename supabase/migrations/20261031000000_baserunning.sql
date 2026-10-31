-- 壘包與跑壘記錄
--
-- 1. runner_events：每一筆是一位跑者在一個 play 中的移動（含打者本身）。
--    壘包狀態、出局數、我方每局得分都由這張表重播推算，不另外存快照。
--    - atbat_id 不為 null：打席造成的移動，刪除打席時一併刪除（ON DELETE CASCADE）
--    - atbat_id 為 null：兩個打席之間的盜壘、暴投、捕逸、牽制等
--    - play_id：同一次記錄（同一個 play）的跑者共用，壘包推算時視為同時發生
--    - from_base 0 = 打者，1-3 = 壘包；to_base 1-3 = 壘包，4 = 回本壘得分，null = 出局
-- 2. game_innings：對手每局得分（我方得分由 runner_events 推算）。
--
-- 全部 idempotent，可重複執行。沒有跑壘資料的舊比賽不受影響。

-- ============================================
-- runner_events
-- ============================================

CREATE TABLE IF NOT EXISTS public.runner_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  atbat_id UUID REFERENCES public.atbats(id) ON DELETE CASCADE,
  play_id UUID NOT NULL,
  inning INTEGER NOT NULL CHECK (inning BETWEEN 1 AND 30),
  runner_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  from_base INTEGER NOT NULL CHECK (from_base BETWEEN 0 AND 3),
  to_base INTEGER CHECK (to_base BETWEEN 1 AND 4),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'batter', 'runner',
    'steal', 'caught_stealing', 'wild_pitch', 'passed_ball', 'pickoff', 'balk', 'other'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 只能往前跑或出局；打者事件一定從 0 出發
  CONSTRAINT runner_events_forward CHECK (to_base IS NULL OR to_base > from_base),
  CONSTRAINT runner_events_batter CHECK ((event_type = 'batter') = (from_base = 0))
);

CREATE INDEX IF NOT EXISTS idx_runner_events_game_id ON public.runner_events(game_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runner_events_atbat_id ON public.runner_events(atbat_id);
CREATE INDEX IF NOT EXISTS idx_runner_events_play_id ON public.runner_events(play_id);

ALTER TABLE public.runner_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "runner_events_select" ON public.runner_events;
CREATE POLICY "runner_events_select" ON public.runner_events FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
DROP POLICY IF EXISTS "runner_events_insert" ON public.runner_events;
CREATE POLICY "runner_events_insert" ON public.runner_events FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "runner_events_update" ON public.runner_events;
CREATE POLICY "runner_events_update" ON public.runner_events FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']))
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "runner_events_delete" ON public.runner_events;
CREATE POLICY "runner_events_delete" ON public.runner_events FOR DELETE
  USING (public.has_role(ARRAY['editor', 'admin']));

-- ============================================
-- game_innings：對手每局得分
-- ============================================

CREATE TABLE IF NOT EXISTS public.game_innings (
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  inning INTEGER NOT NULL CHECK (inning BETWEEN 1 AND 30),
  opp_runs INTEGER NOT NULL DEFAULT 0 CHECK (opp_runs BETWEEN 0 AND 99),
  PRIMARY KEY (game_id, inning)
);

ALTER TABLE public.game_innings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_innings_select" ON public.game_innings;
CREATE POLICY "game_innings_select" ON public.game_innings FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
DROP POLICY IF EXISTS "game_innings_insert" ON public.game_innings;
CREATE POLICY "game_innings_insert" ON public.game_innings FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "game_innings_update" ON public.game_innings;
CREATE POLICY "game_innings_update" ON public.game_innings FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']))
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "game_innings_delete" ON public.game_innings;
CREATE POLICY "game_innings_delete" ON public.game_innings FOR DELETE
  USING (public.has_role(ARRAY['editor', 'admin']));
