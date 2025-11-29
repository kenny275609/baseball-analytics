-- 最終修復：使用最簡單有效的 RLS 規則
-- 這個版本使用最簡單的語法，確保可以正常運作

-- 重新啟用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 刪除所有現有的 policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can view all" ON profiles;

-- 建立最簡單的 policy：使用者可以讀取自己的 profile
-- 不使用 auth.role() 檢查，只檢查 auth.uid()
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- 管理員可以讀取所有 profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 管理員可以更新 profiles
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 驗證 policies
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
