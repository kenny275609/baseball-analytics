-- 強力修復 Profile RLS 規則（含調試）
-- 這個 migration 會徹底重建 RLS 規則

-- 1. 重新啟用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. 刪除所有現有的 policies（確保乾淨開始）
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can view all" ON profiles;

-- 3. 建立一個更寬鬆但安全的 policy
-- 允許所有已認證的使用者讀取自己的 profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (
    -- 確保使用者已認證
    auth.role() = 'authenticated' 
    AND 
    -- 確保是讀取自己的 profile
    auth.uid() = id
  );

-- 4. 管理員可以讀取所有 profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. 管理員可以更新 profiles
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 6. 驗證 policies
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 7. 測試查詢（替換 YOUR_USER_ID）
-- SELECT 
--   auth.uid() as current_user_id,
--   auth.role() as current_role,
--   p.id,
--   p.role,
--   (auth.uid() = p.id) as can_read
-- FROM profiles p
-- WHERE p.id = 'YOUR_USER_ID';
