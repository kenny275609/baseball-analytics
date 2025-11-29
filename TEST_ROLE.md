# 🧪 測試角色讀取

## 步驟 1: 在瀏覽器 Console 中測試

開啟瀏覽器開發者工具（F12），在 Console 標籤中執行：

```javascript
fetch('/api/auth/getSession')
  .then(r => r.json())
  .then(data => {
    console.log('=== API 回應 ===');
    console.log('完整資料:', data);
    console.log('使用者 ID:', data.user?.id);
    console.log('使用者 Email:', data.user?.email);
    console.log('使用者角色:', data.user?.role);
    console.log('================');
  })
  .catch(err => {
    console.error('錯誤:', err);
  });
```

**請告訴我返回的 `role` 是什麼值。**

## 步驟 2: 檢查終端機日誌

查看執行 `npm run dev` 的終端機，看看是否有以下錯誤訊息：
- `Error fetching profile:`
- `Error creating profile:`

如果有，請告訴我完整的錯誤訊息。

## 步驟 3: 確認 Supabase 資料

在 Supabase SQL Editor 中執行（使用 **postgres** 角色）：

```sql
-- 確認您的 profile 資料
SELECT 
  p.id,
  p.role,
  u.email,
  u.id as user_id
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'mjib850529@gmail.com';
```

**確認 `role` 欄位確實是 `editor` 或 `admin`。**

## 步驟 4: 測試 RLS 規則

如果 API 返回的 role 還是 `viewer`，但 Supabase 中確實是 `editor`，問題可能在 RLS。

在 Supabase SQL Editor 中執行（使用 **postgres** 角色）：

```sql
-- 暫時禁用 RLS 來測試
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
```

然後：
1. 重新整理瀏覽器（F5）
2. 再次執行步驟 1 的測試
3. 檢查 role 是否更新

**如果禁用 RLS 後可以正常讀取，問題確實在 RLS 規則。**

測試完後，重新啟用 RLS：

```sql
-- 重新啟用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 重新建立簡單的 policy
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);
```

