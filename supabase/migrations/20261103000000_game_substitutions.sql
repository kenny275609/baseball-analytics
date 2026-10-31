-- 比賽中換人紀錄
--
-- game_lineups 仍然是每個棒次「目前」的球員（打序輪轉、記錄打席都看它）；
-- game_substitutions 記錄每一次換人：誰換下誰、第幾局上/下、哪一種換人、哪個棒次、時間。
-- 已記錄的打席 atbats.player_id 是當時的打者，換人不會改動，原球員的成績維持不變。
--
--   sub_type = 'pinch_hitter' 代打 / 'pinch_runner' 代跑 / 'replace' 守備或一般替換 / 'add_slot' 加棒次
--   base：代跑時跑者所在的壘包（1-3），壘包重播時在換人的時間點把跑者換成代跑者
--   out_player_id：加棒次為 null；球員被刪除時設為 null（換人紀錄保留）
--   client_id：前端產生，重送同一次換人時不會重複寫入
--
-- 沒執行這個 migration 時比賽頁照常使用，只是不能換人（會提示需要先執行 migration）。
-- 全部 idempotent，可重複執行。

CREATE TABLE IF NOT EXISTS public.game_substitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  client_id UUID UNIQUE,
  sub_type TEXT NOT NULL CHECK (sub_type IN ('pinch_hitter', 'pinch_runner', 'replace', 'add_slot')),
  batting_order INTEGER NOT NULL CHECK (batting_order BETWEEN 1 AND 20),
  out_player_id UUID,
  in_player_id UUID,
  inning INTEGER CHECK (inning BETWEEN 1 AND 30),
  half TEXT CHECK (half IN ('top', 'bottom')),
  base INTEGER CHECK (base BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 名稱固定：API 用 players!game_substitutions_out_player_fkey 帶出球員名字
  CONSTRAINT game_substitutions_out_player_fkey
    FOREIGN KEY (out_player_id) REFERENCES public.players(id) ON DELETE SET NULL,
  CONSTRAINT game_substitutions_in_player_fkey
    FOREIGN KEY (in_player_id) REFERENCES public.players(id) ON DELETE SET NULL,
  -- 只有代跑有壘包，代跑一定有壘包與局數
  CONSTRAINT game_substitutions_runner_base
    CHECK (((sub_type = 'pinch_runner') = (base IS NOT NULL)) AND (sub_type <> 'pinch_runner' OR inning IS NOT NULL)),
  CONSTRAINT game_substitutions_add_slot
    CHECK (sub_type <> 'add_slot' OR out_player_id IS NULL),
  -- 換上和換下不能是同一人；有半局就一定有局數
  CONSTRAINT game_substitutions_diff_players
    CHECK (out_player_id IS NULL OR in_player_id IS NULL OR out_player_id <> in_player_id),
  CONSTRAINT game_substitutions_half_inning
    CHECK (half IS NULL OR inning IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_game_substitutions_game_id
  ON public.game_substitutions(game_id, created_at);

-- 同一場比賽一位球員只能在一個棒次：兩支手機同時把同一位替補換進不同棒次時，
-- 後寫入的那支會撞到這個索引（23505），API 撤回換人紀錄並回 409。
-- 舊版「直接覆寫打序」可能已經讓同一位球員出現在兩個棒次；有這種資料時不建索引（不自動刪資料），
-- 只發出 WARNING。先用下面的查詢找出重複的打序、手動修正後再執行一次這個 migration：
--   SELECT game_id, player_id, array_agg(batting_order ORDER BY batting_order) AS batting_orders
--   FROM public.game_lineups GROUP BY game_id, player_id HAVING COUNT(*) > 1;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.game_lineups GROUP BY game_id, player_id HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'game_lineups 有同一場比賽同一位球員重複出現在多個棒次，未建立 idx_game_lineups_game_player；請修正後重新執行此 migration';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_game_lineups_game_player
      ON public.game_lineups(game_id, player_id);
  END IF;
END $$;

ALTER TABLE public.game_substitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_substitutions_select" ON public.game_substitutions;
CREATE POLICY "game_substitutions_select" ON public.game_substitutions FOR SELECT
  USING (public.has_role(ARRAY['viewer', 'editor', 'admin']));
DROP POLICY IF EXISTS "game_substitutions_insert" ON public.game_substitutions;
CREATE POLICY "game_substitutions_insert" ON public.game_substitutions FOR INSERT
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "game_substitutions_update" ON public.game_substitutions;
CREATE POLICY "game_substitutions_update" ON public.game_substitutions FOR UPDATE
  USING (public.has_role(ARRAY['editor', 'admin']))
  WITH CHECK (public.has_role(ARRAY['editor', 'admin']));
DROP POLICY IF EXISTS "game_substitutions_delete" ON public.game_substitutions;
CREATE POLICY "game_substitutions_delete" ON public.game_substitutions FOR DELETE
  USING (public.has_role(ARRAY['editor', 'admin']));

-- 讓 PostgREST 立刻認得新資料表與外鍵（不用等 schema cache 自動更新）
NOTIFY pgrst, 'reload schema';
