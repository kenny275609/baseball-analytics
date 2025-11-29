# 🔧 最終修復角色讀取問題

## 問題確認

API 返回 `角色: viewer`，但 Supabase 中已設定為 `editor`，這表示：
- 資料讀取有問題
- 可能是 RLS 規則阻止讀取
- 或資料沒有真正更新

## 立即修復步驟

### 步驟 1: 確認 Supabase 資料

在 Supabase SQL Editor 中執行（使用 **postgres** 角色）：

```sql
-- 確認您的 profile 資料
SELECT 
  p.id,
  p.role,
  u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'mjib850529@gmail.com';
```

**如果 role 確實是 `editor`，繼續下一步。**

### 步驟 2: 暫時禁用 RLS 測試

在 Supabase SQL Editor 中執行：

```sql
-- 暫時禁用 RLS
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
```

然後：
1. 重新整理瀏覽器（F5）
2. 在 Console 中再次執行測試：
   ```javascript
   fetch('/api/auth/getSession').then(r => r.json()).then(data => console.log('角色:', data.user?.role))
   ```
3. 檢查角色是否更新

**如果禁用 RLS 後可以讀取到正確的角色，問題確實在 RLS 規則。**

### 步驟 3: 重新建立 RLS 規則

測試完後，重新啟用 RLS 並建立正確的規則：

```sql
-- 重新啟用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 刪除所有舊的 policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

-- 建立簡單明確的 policy：使用者可以讀取自己的 profile
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
```

### 步驟 4: 驗證修復

1. 重新整理瀏覽器
2. 在 Console 中測試：
   ```javascript
   fetch('/api/auth/getSession').then(r => r.json()).then(data => console.log('角色:', data.user?.role))
   ```
3. 應該會顯示 `角色: editor`

## 如果還是不行

如果禁用 RLS 後還是讀取不到，可能是：
1. 資料沒有真正更新
2. API 有快取問題
3. 需要重新登入

請執行：
1. 重新登入（登出後再登入）
2. 清除瀏覽器快取
3. 再次測試

