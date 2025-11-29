# 🔧 疑難排解指南

## 問題：註冊後無法登入

### 可能原因 1: Email 驗證未完成

Supabase 預設需要驗證電子郵件才能登入。如果註冊後無法登入，請檢查：

#### 解決方法 A: 關閉 Email 驗證（推薦用於內部系統）

1. 前往 [Supabase Dashboard](https://supabase.com/dashboard)
2. 選擇您的專案
3. 點擊左側選單的 **Authentication** → **Providers**
4. 找到 **Email** 提供者
5. 將 **"Confirm email"** 選項關閉（取消勾選）
6. 點擊 **Save**

這樣註冊後就可以立即登入，不需要驗證郵件。

#### 解決方法 B: 完成 Email 驗證

1. 檢查您的電子郵件收件匣（包括垃圾郵件）
2. 找到來自 Supabase 的確認郵件
3. 點擊郵件中的確認連結
4. 確認後即可登入

---

### 可能原因 2: Profile 未自動建立

雖然系統有自動建立 profile 的 trigger，但有時可能沒有正確執行。

#### 檢查方法：

1. 前往 Supabase Dashboard
2. 點擊 **Table Editor** → **profiles**
3. 檢查是否有對應使用者的記錄

#### 解決方法：手動建立 Profile

如果 `profiles` 資料表中沒有對應記錄，請手動建立：

1. 在 Supabase Dashboard 中，點擊 **Authentication** → **Users**
2. 找到您註冊的使用者
3. 複製使用者的 **UUID**（id）
4. 點擊 **Table Editor** → **profiles**
5. 點擊 **Insert row** 或 **+** 按鈕
6. 填寫：
   - **id**: 貼上剛才複製的 UUID
   - **role**: 選擇 `viewer`（或您想要的角色）
7. 點擊 **Save**

---

### 可能原因 3: 密碼錯誤

請確認：
- 密碼是否正確輸入
- 大小寫是否正確
- 是否有特殊字元

#### 解決方法：重設密碼

1. 前往 Supabase Dashboard
2. 點擊 **Authentication** → **Users**
3. 找到您的使用者
4. 點擊該使用者右側的 **...** 選單
5. 選擇 **Reset password**
6. 或直接點擊使用者，在 **Password** 欄位中手動修改

---

### 可能原因 4: 使用者未啟用

檢查使用者是否被停用：

1. 前往 Supabase Dashboard
2. 點擊 **Authentication** → **Users**
3. 找到您的使用者
4. 檢查 **Banned until** 欄位是否為空
5. 如果有日期，點擊 **Unban user**

---

## 快速檢查清單

如果無法登入，請依序檢查：

- [ ] 是否已完成 Email 驗證？（如果 Supabase 設定了需要驗證）
- [ ] `profiles` 資料表中是否有對應記錄？
- [ ] 密碼是否正確？
- [ ] 使用者是否被停用？
- [ ] Supabase 專案是否正常運作？

---

## 建議設定（用於內部系統）

由於這是內部系統，建議關閉以下功能以簡化使用：

### 1. 關閉 Email 驗證

1. **Authentication** → **Providers** → **Email**
2. 取消勾選 **"Confirm email"**
3. 點擊 **Save**

### 2. 關閉 Email 變更確認

1. **Authentication** → **Settings**
2. 找到 **"Enable email confirmations"**
3. 關閉此選項

### 3. 允許自動確認新使用者

1. **Authentication** → **Settings**
2. 找到 **"Enable email confirmations"**
3. 關閉此選項

---

## 測試登入流程

### 步驟 1: 確認 Supabase 連線

在瀏覽器 Console（F12）中檢查是否有錯誤訊息。

### 步驟 2: 檢查使用者是否建立

在 Supabase Dashboard 的 **Authentication** → **Users** 中確認使用者已建立。

### 步驟 3: 檢查 Profile 是否建立

在 **Table Editor** → **profiles** 中確認有對應記錄。

### 步驟 4: 測試登入

使用正確的 Email 和 Password 嘗試登入。

---

## 如果問題仍然存在

1. **檢查瀏覽器 Console**
   - 按 F12 開啟開發者工具
   - 查看 Console 標籤是否有錯誤訊息
   - 查看 Network 標籤檢查 API 請求是否成功

2. **檢查 Supabase Logs**
   - 在 Supabase Dashboard 中點擊 **Logs**
   - 查看是否有錯誤記錄

3. **重新建立使用者**
   - 刪除現有使用者
   - 重新註冊
   - 確認所有步驟都正確執行

---

## 常見錯誤訊息

### "Invalid login credentials"
- 密碼錯誤
- Email 錯誤
- 使用者不存在

### "Email not confirmed"
- 需要完成 Email 驗證
- 或關閉 Email 驗證設定

### "User not found"
- 使用者未建立
- 或 Email 輸入錯誤

---

© 2024 Baseball Keep Web
