# 🔧 RLS 規則最終解決方案

## 問題確認

禁用 RLS 後可以正常讀取，這確認了：
- ✅ 資料是正確的
- ✅ API 可以正常連線
- ❌ 問題確實在 RLS 規則

## 可能的原因

Server-side Supabase client 使用 `anon key`，在某些情況下 RLS 規則可能無法正確識別 `auth.uid()`。

## 解決方案

### 方案 1: 使用最簡單的 RLS 規則（推薦先試這個）

在 Supabase SQL Editor 中執行：

```sql
-- 重新啟用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 刪除所有舊的 policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

-- 建立最簡單的 policy（不使用任何額外檢查）
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);
```

然後：
1. 重新登入（登出後再登入）
2. 測試是否正常

### 方案 2: 如果方案 1 還是不行，使用更寬鬆的規則

```sql
-- 允許所有已認證的使用者讀取自己的 profile
-- 這個規則更寬鬆，但仍然是安全的
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (
    -- 確保有認證
    auth.uid() IS NOT NULL
    AND
    -- 確保是讀取自己的資料
    auth.uid() = id
  );
```

### 方案 3: 暫時允許所有已認證使用者讀取（僅用於測試）

如果以上都不行，可以暫時使用這個來測試：

```sql
-- 暫時允許所有已認證使用者讀取自己的 profile
CREATE POLICY "Authenticated users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
```

### 方案 4: 如果 RLS 一直有問題（最後手段）

如果 RLS 規則一直無法正常運作，可以考慮：

1. **暫時禁用 RLS**（僅用於內部系統）
   ```sql
   ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
   ```

2. **在應用層面控制權限**（透過 API 路由檢查角色）

3. **使用 Service Role Key**（僅 server-side，絕對不能暴露在前端）

## 建議的測試順序

1. ✅ 先試方案 1（最簡單的規則）
2. 如果不行，試方案 2
3. 如果還是不行，試方案 3
4. 如果都不行，考慮方案 4

## 驗證

執行完 SQL 後：
1. **重新登入**（重要！）
2. 在 Console 測試：
   ```javascript
   fetch('/api/auth/getSession').then(r => r.json()).then(data => console.log('角色:', data.user?.role))
   ```
3. 應該會顯示 `角色: editor`

---

© 2024 Baseball Keep Web
