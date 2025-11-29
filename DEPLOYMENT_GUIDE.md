# 🚀 Baseball Keep Web - 雲端部署指南

## 推薦方案：Vercel（最適合 Next.js）

Vercel 是 Next.js 的開發公司，提供最佳的 Next.js 部署體驗。

### 優點
- ✅ 完全免費（個人專案）
- ✅ 自動 HTTPS
- ✅ 全球 CDN
- ✅ 自動部署（GitHub 連動）
- ✅ 環境變數管理
- ✅ 自動優化

---

## 📋 部署步驟（Vercel）

### 步驟 1: 準備 GitHub Repository

1. **在 GitHub 建立新 Repository**
   - 前往 [GitHub](https://github.com)
   - 點擊右上角 **+** → **New repository**
   - Repository name: `baseball-keep-web`
   - 選擇 **Private**（內部系統建議設為私有）
   - 點擊 **Create repository**

2. **推送程式碼到 GitHub**

```bash
cd /Users/linzongyi/Desktop/Code/baseball_web

# 初始化 Git（如果還沒有）
git init

# 建立 .gitignore（如果還沒有）
# 確保 .env.local 在 .gitignore 中

# 加入所有檔案
git add .

# 提交
git commit -m "Initial commit: Baseball Keep Web"

# 加入遠端 Repository
git remote add origin https://github.com/YOUR_USERNAME/baseball-keep-web.git

# 推送
git branch -M main
git push -u origin main
```

### 步驟 2: 在 Vercel 部署

1. **前往 Vercel**
   - 前往 [Vercel](https://vercel.com)
   - 使用 GitHub 帳號登入

2. **匯入專案**
   - 點擊 **Add New...** → **Project**
   - 選擇剛才建立的 GitHub Repository
   - 點擊 **Import**

3. **設定專案**
   - **Framework Preset**: Next.js（應該自動偵測）
   - **Root Directory**: `./`（預設）
   - **Build Command**: `npm run build`（預設）
   - **Output Directory**: `.next`（預設）

4. **設定環境變數**
   點擊 **Environment Variables**，加入以下變數：

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://faohzxsebzkfqiqjpqxc.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhb2h6eHNlYnprZnFpcWpwcXhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTczNjgsImV4cCI6MjA3OTk5MzM2OH0.BpBhAenMMqpBI2TKpgP0Ck8Pryrqr-sXzahC9CPJpNQ
   ```

5. **部署**
   - 點擊 **Deploy**
   - 等待部署完成（約 2-3 分鐘）

### 步驟 3: 設定 Supabase（如果選擇禁用 RLS）

如果選擇不使用 RLS，在 Supabase SQL Editor 中執行：

```sql
-- 禁用 RLS（僅用於內部系統）
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE atbats DISABLE ROW LEVEL SECURITY;
```

### 步驟 4: 驗證部署

1. 部署完成後，Vercel 會提供一個網址（例如：`baseball-keep-web.vercel.app`）
2. 開啟網址測試功能
3. 確認可以登入和使用

---

## 🔄 持續部署

設定完成後，每次推送程式碼到 GitHub，Vercel 會自動：
- 偵測變更
- 重新建置
- 自動部署

---

## 🌐 其他部署選項

### 選項 2: Netlify

1. 前往 [Netlify](https://www.netlify.com)
2. 使用 GitHub 登入
3. 選擇 Repository
4. 設定環境變數
5. 部署

### 選項 3: Railway

1. 前往 [Railway](https://railway.app)
2. 使用 GitHub 登入
3. 建立新專案
4. 從 GitHub 匯入
5. 設定環境變數
6. 部署

### 選項 4: 自架伺服器

如果需要更多控制，可以：
- 使用 VPS（DigitalOcean, AWS EC2, etc.）
- 安裝 Node.js
- 使用 PM2 管理進程
- 設定 Nginx 反向代理

---

## ⚙️ 部署前檢查清單

- [ ] 程式碼已推送到 GitHub
- [ ] `.env.local` 已加入 `.gitignore`（不會被推送到 GitHub）
- [ ] 環境變數已在部署平台設定
- [ ] Supabase RLS 已設定（或已禁用）
- [ ] 測試過所有功能正常運作

---

## 🔒 安全提醒

1. **不要將 `.env.local` 推送到 GitHub**
2. **環境變數只在部署平台設定**
3. **使用 HTTPS**（Vercel 自動提供）
4. **定期更新依賴套件**

---

## 📝 部署後設定

### 自訂網域（可選）

1. 在 Vercel 專案設定中
2. 前往 **Domains**
3. 加入您的網域
4. 按照指示設定 DNS

### 環境變數更新

如果需要更新環境變數：
1. 在 Vercel 專案設定中
2. 前往 **Environment Variables**
3. 更新變數
4. 重新部署

---

## 🆘 常見問題

### Q: 部署後無法登入？
A: 檢查環境變數是否正確設定

### Q: API 返回 500 錯誤？
A: 檢查 Supabase 連線和 RLS 設定

### Q: 如何查看部署日誌？
A: 在 Vercel Dashboard 的 **Deployments** 標籤中查看

---

© 2024 Baseball Keep Web
