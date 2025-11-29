# ⚾ Baseball Keep Web

專業的棒球打擊資料記錄系統，使用 Next.js、Supabase 和 PWA 技術建構。

## 🎯 專案特色

- **角色權限管理**：支援 admin、editor、viewer 三種角色
- **打擊資料記錄**：完整的打擊紀錄與落點標記功能
- **統計分析**：自動計算打擊率、長打率，並提供落點分布圖
- **PWA 支援**：可安裝到手機主畫面，離線使用
- **現代化 UI**：使用 Shadcn UI 建構美觀的介面

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定 Supabase

1. 在 [Supabase](https://supabase.com) 建立新專案
2. 複製專案 URL 和 Anon Key
3. 在專案根目錄建立 `.env.local` 檔案：

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. 執行資料庫 Migration

在 Supabase Dashboard 的 SQL Editor 中執行 `supabase/migrations/001_initial_schema.sql` 檔案。

### 4. 建立第一個使用者

1. 在 Supabase Dashboard 的 Authentication 中建立使用者
2. 系統會自動建立對應的 profile（預設為 viewer 角色）
3. 在 Supabase Dashboard 的 Table Editor 中手動將第一個使用者的 role 改為 `admin`

### 5. 啟動開發伺服器

```bash
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000) 查看應用程式。

## 📁 專案結構

```
baseball_web/
├── src/
│   ├── app/
│   │   ├── api/              # API 路由
│   │   ├── admin/            # 管理員頁面
│   │   ├── login/            # 登入頁面
│   │   ├── players/          # 球員頁面
│   │   ├── record/          # 記錄頁面
│   │   ├── stats/           # 統計頁面
│   │   └── page.tsx         # 首頁
│   ├── components/          # React 元件
│   └── lib/                 # 工具函式
├── supabase/
│   └── migrations/           # 資料庫 Migration
└── public/                   # 靜態檔案
```

## 🔐 角色權限

### Admin（管理員）
- ✅ 所有功能
- ✅ 管理使用者角色
- ✅ 刪除資料

### Editor（編輯者）
- ✅ 查看所有資料
- ✅ 新增/編輯球員
- ✅ 新增/編輯打擊紀錄
- ❌ 無法刪除資料
- ❌ 無法管理使用者

### Viewer（檢視者）
- ✅ 查看所有資料
- ❌ 無法新增/編輯/刪除任何資料

## 📊 資料庫 Schema

### profiles
- `id` (UUID, PK) - 對應 auth.users.id
- `role` (TEXT) - 角色：admin/editor/viewer
- `created_at` (TIMESTAMP)

### players
- `id` (UUID, PK)
- `name` (TEXT) - 球員姓名
- `number` (TEXT) - 背號
- `created_at` (TIMESTAMP)

### atbats
- `id` (UUID, PK)
- `player_id` (UUID, FK) - 球員 ID
- `contacted` (BOOLEAN) - 是否接觸到球
- `no_contact` (TEXT) - 未接觸原因
- `quality` (TEXT) - 擊球品質
- `result` (TEXT) - 結果
- `rbi` (INTEGER) - 打點
- `hit_x` (FLOAT) - 落點 X 座標 (0-100)
- `hit_y` (FLOAT) - 落點 Y 座標 (0-100)
- `note` (TEXT) - 備註
- `created_at` (TIMESTAMP)

## 🛠️ 技術規格

- **框架**：Next.js 14 (App Router)
- **語言**：TypeScript
- **樣式**：Tailwind CSS
- **UI 元件**：Shadcn UI
- **資料庫**：Supabase (PostgreSQL)
- **認證**：Supabase Auth
- **圖表**：Recharts
- **PWA**：Next.js PWA 支援

## 📱 PWA 功能

1. 在手機瀏覽器中開啟網站
2. 點擊「加入主畫面」
3. 即可像原生 App 一樣使用

## 🚀 部署

### Vercel 部署

1. 將專案推送到 GitHub
2. 在 Vercel 中匯入專案
3. 設定環境變數：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. 部署完成

## 📝 開發說明

### 新增功能
- 在 `src/app/api/` 中建立 API 路由
- 在 `src/app/` 中建立頁面
- 在 `src/components/` 中建立可重用元件

### 修改資料庫
- 在 `supabase/migrations/` 中建立新的 migration 檔案
- 在 Supabase Dashboard 中執行 migration

## 📄 授權

MIT License

---

© 2024 Baseball Keep Web. 專業棒球資料管理系統