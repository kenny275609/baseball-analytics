-- runner_events：atbat_id 與 event_type 必須對應
--
-- - atbat_id 不為 null：打席造成的移動，event_type 只能是 batter / runner
-- - atbat_id 為 null：兩個打席之間的盜壘、暴投、捕逸、牽制等，不能是 batter / runner
--
-- 打席刪除時事件由 ON DELETE CASCADE 一起刪除，不會留下 atbat_id 為 null 的 batter/runner。
-- 全部 idempotent，可重複執行。若既有資料不符會在 VALIDATE 時失敗，需先手動清理。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'runner_events_atbat_type'
      AND conrelid = 'public.runner_events'::regclass
  ) THEN
    ALTER TABLE public.runner_events
      ADD CONSTRAINT runner_events_atbat_type
      CHECK ((atbat_id IS NOT NULL) = (event_type IN ('batter', 'runner')))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.runner_events VALIDATE CONSTRAINT runner_events_atbat_type;
