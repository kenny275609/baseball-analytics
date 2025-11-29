# Vercel 環境變數設定指南

## 問題：Invalid API key

如果您在 Vercel 上遇到 "Invalid API key" 錯誤，這是因為 Supabase 的環境變數沒有正確設置。

## 解決步驟

### 1. 取得 Supabase 環境變數

1. 前往 [Supabase Dashboard](https://app.supabase.com/)
2. 選擇您的專案
3. 點擊左側選單的 **Settings** (設定)
4. 點擊 **API** 選項
5. 您會看到以下資訊：
   - **Project URL** - 這是 `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key - 這是 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. 在 Vercel 中設定環境變數

1. 前往 [Vercel Dashboard](https://vercel.com/dashboard)
2. 選擇您的專案
3. 點擊 **Settings** (設定)
4. 點擊左側選單的 **Environment Variables** (環境變數)
5. 新增以下兩個環境變數：

   **變數 1：**
   - Name: `NEXT_PUBLIC_SUPABASE_URL`
   - Value: 您的 Supabase Project URL（例如：`https://xxxxx.supabase.co`）
   - Environment: 選擇 **Production**, **Preview**, **Development**（全部勾選）

   **變數 2：**
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Value: 您的 Supabase anon public key（很長的字串）
   - Environment: 選擇 **Production**, **Preview**, **Development**（全部勾選）

6. 點擊 **Save** (儲存)

### 3. 重新部署

設定完環境變數後，您需要重新部署：

1. 在 Vercel Dashboard 中，點擊 **Deployments** (部署)
2. 找到最新的部署記錄
3. 點擊右側的 **...** (三個點)
4. 選擇 **Redeploy** (重新部署)

或者，您可以：
- 推送一個新的 commit 到 Git 倉庫
- Vercel 會自動觸發新的部署

### 4. 驗證設定

重新部署後，檢查：
1. 登入頁面是否正常顯示
2. 嘗試註冊或登入
3. 如果還有錯誤，檢查瀏覽器控制台（F12）的錯誤訊息

## 注意事項

- ⚠️ **重要**：環境變數名稱必須完全一致（大小寫敏感）
- ⚠️ **重要**：確保在 Production、Preview、Development 三個環境都設定了環境變數
- ⚠️ **安全**：`NEXT_PUBLIC_SUPABASE_ANON_KEY` 是公開的，可以安全地放在前端代碼中
- ⚠️ **不要**：不要將 `service_role` key 放在環境變數中，這應該只在後端使用

## 環境變數清單

您需要在 Vercel 中設定的環境變數：

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## 疑難排解

如果設定後仍有問題：

1. **檢查環境變數是否正確**：
   - 確認 URL 和 Key 沒有多餘的空格
   - 確認 URL 包含 `https://` 前綴

2. **檢查部署日誌**：
   - 在 Vercel Dashboard 中查看部署日誌
   - 確認環境變數是否被正確讀取

3. **清除瀏覽器快取**：
   - 清除瀏覽器快取和 Cookie
   - 使用無痕模式測試

4. **檢查 Supabase 專案狀態**：
   - 確認 Supabase 專案沒有暫停
   - 確認 API 金鑰沒有被撤銷

## 相關文件

- [Vercel 環境變數文件](https://vercel.com/docs/concepts/projects/environment-variables)
- [Supabase 環境變數文件](https://supabase.com/docs/guides/getting-started/local-development#environment-variables)
