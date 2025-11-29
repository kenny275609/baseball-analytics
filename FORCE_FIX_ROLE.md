# 🔧 強制修復角色讀取問題

## 問題：Supabase 中已更新 role，但網站還是顯示檢視者

## 立即修復步驟

### 步驟 1: 確認資料已更新

在 Supabase SQL Editor 中執行（使用 **postgres** 角色）：

```sql
-- 查看您的 profile
SELECT 
  p.id,
  p.role,
  u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'mjib850529@gmail.com';
```

**確認 role 欄位確實是 `editor` 或 `admin`**。

### 步驟 2: 執行強制修復 Migration

在 Supabase SQL Editor 中執行 `004_bypass_rls_for_server.sql`：

```sql
-- 刪除並重新建立 policy
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

### 步驟 3: 如果還是不行，暫時禁用 RLS 測試

**⚠️ 警告：這只是用來測試，確認問題是否在 RLS**

```sql
-- 暫時禁用 RLS
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
```

然後：
1. 重新整理瀏覽器
2. 檢查角色是否更新

如果禁用 RLS 後可以正常讀取，問題確實在 RLS 規則。

**測試完後，記得重新啟用 RLS：**

```sql
-- 重新啟用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 重新建立 policy
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);
```

### 步驟 4: 檢查 API 回應

在瀏覽器開發者工具（F12）的 Console 中執行：

```javascript
fetch('/api/auth/getSession')
  .then(r => r.json())
  .then(data => {
    console.log('Session data:', data);
    console.log('Role:', data.user?.role);
  });
```

查看返回的 role 是什麼。

### 步驟 5: 檢查 Server Logs

查看終端機中 Next.js 的輸出，看看是否有錯誤訊息，特別是：
- `Error fetching profile:`
- `Error creating profile:`

## 如果以上都不行：使用 Service Role Key（最後手段）

如果 RLS 規則一直有問題，可以暫時使用 Service Role Key 來讀取資料（僅用於測試）。

**⚠️ 注意：Service Role Key 會繞過所有 RLS，只能在 server-side 使用，絕對不能暴露在前端！**

1. 在 Supabase Dashboard 中取得 Service Role Key
2. 在 `.env.local` 中加入：
   ```
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. 修改 `src/lib/supabase/server.ts` 暫時使用 Service Role Key（僅測試用）

但這不是長期解決方案，應該修復 RLS 規則。

## 最可能的原因

1. **RLS 規則阻止讀取**：即使規則看起來正確，可能有其他問題
2. **API 使用錯誤的 Supabase Client**：可能沒有正確傳遞認證資訊
3. **快取問題**：瀏覽器或 Next.js 快取了舊資料

## 建議的測試順序

1. ✅ 執行步驟 1 確認資料已更新
2. ✅ 執行步驟 4 檢查 API 回應
3. ✅ 如果 API 返回的 role 還是 viewer，執行步驟 3 暫時禁用 RLS 測試
4. ✅ 如果禁用 RLS 後可以讀取，執行步驟 2 修復 RLS 規則

---

© 2024 Baseball Keep Web
