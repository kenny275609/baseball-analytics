-- 最終修復 Profile RLS 規則
-- 確保使用者可以讀取自己的 profile

-- 重新啟用 RLS（如果之前禁用了）
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 刪除所有舊的 policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

-- 建立簡單明確的 policy：使用者可以讀取自己的 profile
-- 這是核心規則，必須正確設定
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

-- 驗證：檢查 policies 是否正確建立
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
