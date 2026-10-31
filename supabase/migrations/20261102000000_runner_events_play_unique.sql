-- 離線同步的重複防護：同一個 play 的同一個出發壘包只能有一筆跑壘事件
--
-- 離線記錄時前端為每筆打席/跑壘產生 client_id，伺服器拿來當 play_id。
-- 重送時 API 會先查這個 play_id 是否已寫入，已寫入就直接回傳原本的資料；
-- 這個 unique index 再擋住「兩個重送請求同時到」時的重複寫入（API 收到 23505 會撤回並回傳先寫入的那筆）。
-- 沒執行這個 migration 也能用，只是少了同時重送時的保護。
--
-- 全部 idempotent，可重複執行。
-- 既有資料若有重複，建立 index 會失敗，可先用下面的查詢找出來手動清理：
--   SELECT play_id, from_base, COUNT(*) FROM public.runner_events
--   GROUP BY play_id, from_base HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS runner_events_play_from_unique
  ON public.runner_events (play_id, from_base);
