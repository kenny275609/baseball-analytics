# 🔧 修復 Profile 與 Auth Users 不一致問題

## 問題描述

如果 `profiles` 資料表中有資料，但 `auth.users` 中沒有對應的使用者，這會導致登入失敗。

## 原因分析

1. **外鍵約束問題**：`profiles.id` 應該參考 `auth.users.id`，如果 profiles 有資料但 auth.users 沒有，可能是：
   - 外鍵約束沒有正確建立
   - 或者資料不一致（手動插入了 profiles 但沒有建立 auth user）

2. **Trigger 執行順序問題**：Trigger 可能沒有正確執行

## 解決方法

### 方法 1: 執行修復 Migration（推薦）

1. 前往 Supabase Dashboard
2. 點擊 **SQL Editor**
3. 執行 `supabase/migrations/002_fix_profile_trigger.sql` 中的 SQL

這個 migration 會：
- 重新建立 trigger 和 function
- 為現有的 auth.users 但沒有 profile 的使用者自動建立 profile
- 確保 trigger 正確執行

### 方法 2: 手動檢查和修復

#### 步驟 1: 檢查資料一致性

在 Supabase Dashboard 的 SQL Editor 中執行：

```sql
-- 檢查 profiles 中是否有 auth.users 中不存在的 id
SELECT p.id, p.role, p.created_at
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE u.id IS NULL;
```

如果查詢有結果，表示有孤立的 profiles 記錄。

#### 步驟 2: 刪除孤立的 Profiles

```sql
-- 刪除沒有對應 auth.users 的 profiles
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM auth.users);
```

#### 步驟 3: 為現有的 Auth Users 建立 Profiles

```sql
-- 為所有 auth.users 但沒有 profile 的使用者建立 profile
INSERT INTO public.profiles (id, role, created_at)
SELECT 
  id,
  'viewer',
  COALESCE(created_at, NOW())
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
```

### 方法 3: 重新建立使用者（如果資料不重要）

如果資料不重要，可以：

1. **刪除所有 profiles 記錄**
   ```sql
   DELETE FROM public.profiles;
   ```

2. **重新註冊使用者**
   - 在網站上重新註冊
   - 或透過 Supabase Dashboard 建立使用者

## 預防措施

### 確保 Trigger 正確執行

執行以下 SQL 確認 trigger 存在：

```sql
-- 檢查 trigger 是否存在
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

### 確保外鍵約束存在

```sql
-- 檢查外鍵約束
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'profiles';
```

## 驗證修復

修復後，執行以下查詢確認資料一致性：

```sql
-- 檢查所有 auth.users 都有對應的 profile
SELECT 
  u.id,
  u.email,
  u.created_at as user_created_at,
  p.role,
  p.created_at as profile_created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ORDER BY u.created_at DESC;
```

所有使用者都應該有對應的 profile。

## 常見問題

### Q: 為什麼會出現這個問題？

A: 可能的原因：
- 手動在 profiles 中插入了資料，但沒有建立 auth user
- Trigger 沒有正確執行
- 外鍵約束沒有正確建立

### Q: 刪除孤立的 profiles 會影響什麼嗎？

A: 不會，因為這些 profiles 沒有對應的 auth user，所以無法登入，刪除它們不會影響系統運作。

### Q: 如何確保以後不會再發生？

A: 
1. 確保 migration 已正確執行
2. 不要手動在 profiles 中插入資料，應該透過註冊流程
3. 定期檢查資料一致性

---

© 2024 Baseball Keep Web



