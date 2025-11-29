# 🚀 Baseball Keep Web - 完整安裝指南

## 步驟 1: 安裝依賴

```bash
cd baseball_web
npm install
```

## 步驟 2: 設定 Supabase

### 2.1 建立 Supabase 專案

1. 前往 [https://supabase.com](https://supabase.com)
2. 登入或註冊帳號
3. 點擊 "New Project"
4. 填寫專案資訊：
   - Project Name: `baseball-keep-web`
   - Database Password: 設定一個強密碼（請記住！）
   - Region: 選擇離您最近的區域
5. 點擊 "Create new project"
6. 等待專案建立完成（約 2-3 分鐘）

### 2.2 取得 API 金鑰

1. 在 Supabase Dashboard 中，點擊左側選單的 "Settings" (⚙️)
2. 點擊 "API"
3. 複製以下資訊：
   - **Project URL** (例如: `https://xxxxx.supabase.co`)
   - **anon public** key (在 "Project API keys" 區塊中)

### 2.3 設定環境變數

1. 在專案根目錄建立 `.env.local` 檔案：

```bash
cp .env.example .env.local
```

2. 編輯 `.env.local`，填入您的 Supabase 資訊：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 步驟 3: 執行資料庫 Migration

### 3.1 在 Supabase Dashboard 執行 SQL

1. 在 Supabase Dashboard 中，點擊左側選單的 "SQL Editor"
2. 點擊 "New query"
3. 開啟專案中的 `supabase/migrations/001_initial_schema.sql` 檔案
4. 複製整個 SQL 內容
5. 貼上到 Supabase SQL Editor
6. 點擊 "Run" 或按 `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)
7. 確認執行成功（應該會看到 "Success. No rows returned"）

### 3.2 驗證資料表建立

1. 在 Supabase Dashboard 中，點擊左側選單的 "Table Editor"
2. 您應該會看到三個資料表：
   - `profiles`
   - `players`
   - `atbats`

## 步驟 4: 建立第一個使用者（Admin）

### 4.1 在 Supabase 建立使用者

1. 在 Supabase Dashboard 中，點擊左側選單的 "Authentication"
2. 點擊 "Users" 標籤
3. 點擊 "Add user" → "Create new user"
4. 填寫資訊：
   - Email: 您的電子郵件
   - Password: 設定密碼
   - Auto Confirm User: ✅ 勾選
5. 點擊 "Create user"

### 4.2 設定為 Admin 角色

1. 在 Supabase Dashboard 中，點擊左側選單的 "Table Editor"
2. 選擇 `profiles` 資料表
3. 找到剛才建立的使用者（id 會對應 auth.users 的 id）
4. 點擊該列進行編輯
5. 將 `role` 欄位從 `viewer` 改為 `admin`
6. 儲存

## 步驟 5: 建立 PWA 圖示（可選）

### 5.1 建立圖示檔案

您需要建立兩個圖示檔案：
- `public/icon-192.png` (192x192 像素)
- `public/icon-512.png` (512x512 像素)

可以使用以下工具：
- [Favicon Generator](https://favicon.io/)
- [RealFaviconGenerator](https://realfavicongenerator.net/)
- 或使用任何圖片編輯軟體

### 5.2 放置圖示

將建立好的圖示檔案放到 `public/` 資料夾中。

## 步驟 6: 啟動開發伺服器

```bash
npm run dev
```

開啟瀏覽器，前往 [http://localhost:3000](http://localhost:3000)

## 步驟 7: 登入系統

1. 系統會自動導向到 `/login` 頁面
2. 輸入剛才建立的 Email 和 Password
3. 點擊 "登入"
4. 成功登入後會看到首頁

## ✅ 驗證安裝

### 檢查功能

1. **首頁** (`/`)
   - 應該可以看到球員列表（目前是空的）
   - 如果角色是 admin 或 editor，應該可以看到 "新增球員" 按鈕

2. **新增球員**
   - 點擊 "新增球員"
   - 填寫姓名和背號
   - 點擊 "建立"
   - 應該可以在列表中看到新建立的球員

3. **查看球員紀錄**
   - 點擊球員的 "查看紀錄" 按鈕
   - 應該可以看到該球員的打擊紀錄頁面

4. **新增打擊紀錄** (需要 editor 或 admin 角色)
   - 在球員頁面點擊 "新增打擊紀錄"
   - 填寫打擊資訊
   - 如果選擇 "接觸到球"，會導向落點標記頁面
   - 點擊球場標記落點
   - 完成後應該可以在紀錄列表中看到

5. **查看統計** (需要資料)
   - 在球員頁面點擊 "查看統計"
   - 應該可以看到打擊率和長打率
   - 如果有落點資料，應該可以看到散點圖

6. **使用者管理** (僅 admin)
   - 在導航列點擊 "使用者管理"
   - 應該可以看到所有使用者列表
   - 可以修改使用者角色

## 🔧 疑難排解

### 問題 1: 無法登入

**解決方法**：
- 確認 Supabase 專案已正確建立
- 確認環境變數已正確設定
- 確認使用者在 Supabase Authentication 中已建立
- 檢查瀏覽器 Console 是否有錯誤訊息

### 問題 2: 權限錯誤

**解決方法**：
- 確認 RLS 規則已正確執行
- 確認使用者的 profile 已建立
- 確認角色設定正確（admin/editor/viewer）

### 問題 3: API 錯誤

**解決方法**：
- 檢查 Supabase 專案是否正常運作
- 檢查環境變數是否正確
- 檢查瀏覽器 Console 和 Network 標籤的錯誤訊息

### 問題 4: 資料表不存在

**解決方法**：
- 確認 migration SQL 已正確執行
- 在 Supabase Dashboard 的 Table Editor 中檢查資料表是否存在
- 如果不存在，重新執行 migration SQL

## 📝 下一步

1. **建立更多使用者**：在 Supabase Authentication 中建立更多使用者
2. **設定角色**：在 `profiles` 資料表中設定不同使用者的角色
3. **開始記錄資料**：開始新增球員和打擊紀錄
4. **自訂樣式**：根據需求調整 Tailwind CSS 樣式
5. **部署上線**：將專案部署到 Vercel 或其他平台

## 🎉 完成！

恭喜！您已經成功設定 Baseball Keep Web 系統。現在可以開始使用了！

如有任何問題，請參考：
- [README.md](./README.md) - 專案說明
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - 專案結構說明
