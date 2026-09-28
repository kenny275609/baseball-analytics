# 📋 Migration 執行指南

## Migration 檔案說明

### 001_initial_schema.sql
- **用途**：建立完整的資料庫結構
- **內容**：
  - 建立 `profiles`、`players`、`atbats` 資料表
  - 設定 RLS (Row Level Security) 規則
  - 建立自動建立 profile 的 trigger

### 002_fix_profile_trigger.sql
- **用途**：修復 trigger 並補齊缺失的 profiles
- **內容**：
  - 重新建立修復後的 trigger 和 function
  - 為現有的 `auth.users` 但沒有 `profile` 的使用者建立 profile

## 執行方式

### 情況 1: 全新安裝（還沒執行過任何 migration）

**執行順序：**
1. 先執行 `001_initial_schema.sql`
2. 再執行 `002_fix_profile_trigger.sql`

**步驟：**
1. 前往 Supabase Dashboard → SQL Editor
2. 執行 `001_initial_schema.sql`（複製整個檔案內容，貼上，執行）
3. 執行 `002_fix_profile_trigger.sql`（複製整個檔案內容，貼上，執行）

### 情況 2: 已經執行過 001，但遇到問題

**只需要執行：**
- `002_fix_profile_trigger.sql`

**步驟：**
1. 前往 Supabase Dashboard → SQL Editor
2. 執行 `002_fix_profile_trigger.sql`（複製整個檔案內容，貼上，執行）

### 情況 3: 想要重新開始（刪除所有資料）

**⚠️ 警告：這會刪除所有資料！**

1. 在 Supabase Dashboard 中手動刪除所有資料表
2. 或執行以下 SQL：
   ```sql
   DROP TABLE IF EXISTS atbats CASCADE;
   DROP TABLE IF EXISTS players CASCADE;
   DROP TABLE IF EXISTS profiles CASCADE;
   DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
   ```
3. 然後重新執行 `001_initial_schema.sql`
4. 再執行 `002_fix_profile_trigger.sql`

## 重要提醒

- ✅ **不要刪除 001**：001 是基礎架構，必須保留
- ✅ **002 是修復檔**：可以安全地重複執行（使用 `IF EXISTS` 和 `ON CONFLICT`）
- ✅ **執行順序很重要**：必須先執行 001，再執行 002
- ⚠️ **不要修改已執行的 migration**：如果已經執行過，不要修改檔案內容

## 驗證執行結果

執行後，可以用以下 SQL 驗證：

```sql
-- 檢查資料表是否存在
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('profiles', 'players', 'atbats');

-- 檢查 trigger 是否存在
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 檢查所有 auth.users 都有 profile
SELECT 
  u.id,
  u.email,
  CASE WHEN p.id IS NULL THEN '缺少 profile' ELSE '正常' END as status
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id;
```

---

© 2024 Baseball Keep Web



