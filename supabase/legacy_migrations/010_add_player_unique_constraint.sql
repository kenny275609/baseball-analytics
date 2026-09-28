-- 新增球員名字+背號的唯一性約束
-- 防止重複的球員名字+背號組合

-- 先檢查是否有重複資料
-- 如果有重複，需要先清理（可選）

-- 建立唯一性約束
-- 注意：如果 number 為 NULL，則只檢查 name 的唯一性
-- 如果 number 不為 NULL，則檢查 (name, number) 的唯一性

-- 方法 1：使用唯一索引（推薦）
-- 這允許多個 NULL 值，但非 NULL 值必須唯一
CREATE UNIQUE INDEX IF NOT EXISTS players_name_number_unique 
ON players (name, COALESCE(number, ''));

-- 如果上面的方法不適用，可以使用部分唯一索引
-- 這個索引只對 number 不為 NULL 的記錄建立唯一性約束
CREATE UNIQUE INDEX IF NOT EXISTS players_name_number_not_null_unique 
ON players (name, number) 
WHERE number IS NOT NULL;

-- 對於 number 為 NULL 的情況，只檢查 name 的唯一性
CREATE UNIQUE INDEX IF NOT EXISTS players_name_null_number_unique 
ON players (name) 
WHERE number IS NULL;



