# 🔧 快速修復登入問題

## 錯誤：Invalid login credentials

這個錯誤通常表示：
1. 密碼錯誤
2. 使用者不存在
3. Email 驗證未完成

## 立即檢查步驟

### 步驟 1: 檢查 Supabase 中是否有使用者

1. 前往 [Supabase Dashboard](https://supabase.com/dashboard)
2. 選擇您的專案
3. 點擊 **Authentication** → **Users**
4. 檢查是否有 `cht878133@gmail.com` 這個使用者

### 步驟 2: 檢查使用者狀態

在 Users 列表中，檢查：
- **Email Confirmed At**：是否有日期？（如果為空，需要驗證 Email）
- **Banned Until**：是否為空？（如果有日期，使用者被停用）

### 步驟 3: 檢查 Profile 是否存在

1. 在 Supabase Dashboard 中，點擊 **Table Editor** → **profiles**
2. 檢查是否有對應使用者的記錄
3. 如果沒有，需要手動建立（見下方）

## 解決方法

### 方法 1: 重設密碼（如果使用者存在）

1. 在 **Authentication** → **Users** 中找到使用者
2. 點擊使用者進入詳情
3. 在 **Password** 欄位中手動設定新密碼
4. 點擊 **Save**
5. 使用新密碼登入

### 方法 2: 關閉 Email 驗證（如果使用者存在但未驗證）

1. 前往 **Authentication** → **Providers**
2. 找到 **Email** 提供者
3. 將 **"Confirm email"** 選項關閉（取消勾選）
4. 點擊 **Save**
5. 然後重設密碼（方法 1）

### 方法 3: 手動建立 Profile（如果使用者存在但沒有 Profile）

在 Supabase Dashboard 的 SQL Editor 中執行：

```sql
-- 為現有的 auth.users 但沒有 profile 的使用者建立 profile
INSERT INTO public.profiles (id, role, created_at)
SELECT 
  id,
  'viewer',
  COALESCE(created_at, NOW())
FROM auth.users
WHERE email = 'cht878133@gmail.com'
  AND id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
```

### 方法 4: 重新註冊（如果使用者不存在）

1. 在登入頁面點擊「還沒有帳號？點此註冊」
2. 使用 `cht878133@gmail.com` 重新註冊
3. 設定新密碼
4. 註冊成功後登入

## 快速診斷 SQL

在 Supabase SQL Editor 中執行以下 SQL 來診斷問題：

```sql
-- 檢查使用者是否存在
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  banned_until
FROM auth.users
WHERE email = 'cht878133@gmail.com';

-- 檢查 Profile 是否存在
SELECT 
  p.id,
  p.role,
  p.created_at,
  u.email
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE u.email = 'cht878133@gmail.com';
```

## 最常見的解決方案

**如果使用者存在但無法登入：**

1. **關閉 Email 驗證**（如果已開啟）
   - Authentication → Providers → Email → 關閉 "Confirm email"

2. **重設密碼**
   - Authentication → Users → 找到使用者 → 手動設定新密碼

3. **確認 Profile 存在**
   - Table Editor → profiles → 檢查是否有對應記錄
   - 如果沒有，執行方法 3 的 SQL

完成這些步驟後，應該就可以登入了！




