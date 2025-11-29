-- 修復 Profile RLS 規則，確保使用者可以讀取自己的 profile
-- 這個 migration 會重新建立更寬鬆的 RLS 規則

-- 刪除現有的 policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

-- 重新建立：使用者可以讀取自己的 profile
-- 使用更簡單的規則，確保不會有問題
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

-- 允許 Service Role 或 Postgres Role 讀取所有 profiles（用於後端 API）
-- 這確保 server-side API 可以讀取資料
-- 注意：這需要確保 API 使用正確的 Supabase client

-- 測試查詢：檢查特定使用者的 profile
-- 在 Supabase SQL Editor 中執行以下查詢來測試（替換 YOUR_USER_ID）：
-- SELECT id, role, created_at FROM profiles WHERE id = 'YOUR_USER_ID';
