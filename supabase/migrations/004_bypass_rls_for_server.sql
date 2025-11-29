-- 暫時放寬 RLS 規則，確保 server-side API 可以讀取資料
-- 這個 migration 會讓使用者可以讀取自己的 profile，不受 RLS 限制

-- 方法 1: 確保使用者可以讀取自己的 profile（應該已經有了，但確保正確）
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 方法 2: 允許所有已認證的使用者讀取自己的 profile（更寬鬆）
-- 如果上面的還是不行，可以使用這個：
-- DROP POLICY IF EXISTS "Authenticated users can view own profile" ON profiles;
-- CREATE POLICY "Authenticated users can view own profile"
--   ON profiles FOR SELECT
--   USING (auth.role() = 'authenticated' AND auth.uid() = id);

-- 方法 3: 如果還是不行，可以暫時禁用 RLS 來測試（不建議用於生產環境）
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 驗證：檢查 RLS 是否啟用
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'profiles';

-- 驗證：檢查 policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles';
