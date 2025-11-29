# 🔍 診斷角色更新問題

## 問題：在 Supabase 中修改 role 後，網站上還是顯示檢視者

## 診斷步驟

### 步驟 1: 確認資料庫中的資料已更新

在 Supabase SQL Editor 中執行：

```sql
-- 查看所有 profiles（需要 postgres 角色）
SELECT 
  id,
  role,
  created_at,
  (SELECT email FROM auth.users WHERE id = profiles.id) as email
FROM profiles
ORDER BY created_at DESC;
```

確認您的使用者 role 是否已正確更新。

### 步驟 2: 測試 RLS 規則

在 Supabase SQL Editor 中，切換到 **postgres** 角色執行：

```sql
-- 測試：以特定使用者身份查詢自己的 profile
-- 替換 YOUR_USER_ID 為您的使用者 UUID
SET LOCAL request.jwt.claim.sub = 'YOUR_USER_ID';
SELECT id, role FROM profiles WHERE id = 'YOUR_USER_ID';
```

### 步驟 3: 檢查 API 是否正確讀取

在瀏覽器開發者工具（F12）的 Console 中執行：

```javascript
fetch('/api/auth/getSession')
  .then(r => r.json())
  .then(console.log);
```

查看返回的資料中 role 是否正確。

### 步驟 4: 執行修復 Migration

如果 RLS 規則有問題，執行：

```sql
-- 在 Supabase SQL Editor 中執行 003_fix_profile_rls.sql
```

## 常見問題和解決方法

### 問題 1: RLS 規則太嚴格

**症狀**：API 返回 null 或錯誤

**解決方法**：
1. 執行 `003_fix_profile_rls.sql`
2. 確認規則允許使用者讀取自己的 profile

### 問題 2: 資料沒有真正更新

**症狀**：Supabase Dashboard 顯示已更新，但查詢還是舊值

**解決方法**：
1. 在 Supabase Dashboard 中重新檢查 profiles 資料表
2. 確認 role 欄位確實已更新
3. 如果沒有，手動更新：
   ```sql
   UPDATE profiles 
   SET role = 'editor'  -- 或 'admin'
   WHERE id = 'YOUR_USER_ID';
   ```

### 問題 3: 快取問題

**症狀**：資料已更新，但前端還是顯示舊值

**解決方法**：
1. 強制重新整理瀏覽器（Ctrl+Shift+R 或 Cmd+Shift+R）
2. 清除瀏覽器快取
3. 重新登入

### 問題 4: API 使用錯誤的 Supabase Client

**症狀**：API 無法讀取資料

**解決方法**：
- 確認 API 使用 server-side client（`createClient` from `@/lib/supabase/server`）
- 確認環境變數已正確設定

## 快速修復 SQL

如果以上方法都不行，執行以下 SQL（在 Supabase SQL Editor 中，使用 postgres 角色）：

```sql
-- 1. 確認您的使用者 ID
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- 2. 直接更新 role（使用 postgres 角色，繞過 RLS）
UPDATE profiles 
SET role = 'editor'  -- 或 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');

-- 3. 驗證更新
SELECT 
  p.id,
  p.role,
  u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'your-email@example.com';
```

## 驗證修復

修復後，執行以下步驟驗證：

1. **重新整理瀏覽器**（F5 或 Cmd+R）
2. **檢查 Navbar**：角色標籤應該更新
3. **檢查功能按鈕**：
   - Editor/Admin：應該看到「新增球員」按鈕
   - Admin：應該看到「使用者管理」按鈕

---

© 2024 Baseball Keep Web
