# 📁 Baseball Keep Web - 專案結構說明

## 完整專案結構

```
baseball_web/
├── .env.example                    # 環境變數範例
├── .gitignore
├── README.md                       # 專案說明
├── PROJECT_STRUCTURE.md            # 本檔案
├── next.config.ts                  # Next.js 設定
├── package.json                    # 專案依賴
├── tsconfig.json                   # TypeScript 設定
├── tailwind.config.ts              # Tailwind CSS 設定
├── components.json                 # Shadcn UI 設定
│
├── public/                         # 靜態檔案
│   ├── manifest.json               # PWA Manifest
│   ├── icon-192.png               # PWA 圖示 (需自行建立)
│   └── icon-512.png               # PWA 圖示 (需自行建立)
│
├── supabase/                       # Supabase 相關
│   └── migrations/
│       └── 001_initial_schema.sql   # 資料庫 Schema 和 RLS
│
└── src/
    ├── app/                        # Next.js App Router
    │   ├── api/                    # API 路由
    │   │   ├── auth/
    │   │   │   └── getSession/
    │   │   │       └── route.ts    # 取得目前使用者資訊
    │   │   ├── players/
    │   │   │   ├── list/
    │   │   │   │   └── route.ts    # 取得球員列表
    │   │   │   ├── create/
    │   │   │   │   └── route.ts    # 新增球員
    │   │   │   ├── update/
    │   │   │   │   └── route.ts    # 更新球員
    │   │   │   └── delete/
    │   │   │       └── route.ts    # 刪除球員
    │   │   ├── atbats/
    │   │   │   ├── list/
    │   │   │   │   └── route.ts    # 取得打擊紀錄列表
    │   │   │   ├── create/
    │   │   │   │   └── route.ts    # 新增打擊紀錄
    │   │   │   ├── update/
    │   │   │   │   └── route.ts    # 更新打擊紀錄
    │   │   │   └── delete/
    │   │   │       └── route.ts    # 刪除打擊紀錄
    │   │   └── admin/
    │   │       └── users/
    │   │           └── route.ts    # 管理使用者角色
    │   │
    │   ├── login/
    │   │   └── page.tsx            # 登入頁面
    │   │
    │   ├── admin/
    │   │   └── users/
    │   │       └── page.tsx        # 使用者管理頁面 (admin only)
    │   │
    │   ├── players/
    │   │   └── [id]/
    │   │       └── page.tsx        # 球員詳細頁面
    │   │
    │   ├── record/
    │   │   └── [player_id]/
    │   │       ├── page.tsx        # 記錄打擊頁面
    │   │       └── hitpoint/
    │   │           └── page.tsx    # 標記打擊落點頁面
    │   │
    │   ├── stats/
    │   │   └── [player_id]/
    │   │       └── page.tsx        # 打擊統計頁面
    │   │
    │   ├── layout.tsx               # 根 Layout (包含 Navbar)
    │   ├── page.tsx                 # 首頁 (球員列表)
    │   ├── globals.css              # 全域樣式
    │   └── favicon.ico
    │
    ├── components/                  # React 元件
    │   ├── ui/                     # Shadcn UI 元件
    │   │   ├── button.tsx
    │   │   ├── card.tsx
    │   │   ├── input.tsx
    │   │   ├── label.tsx
    │   │   ├── table.tsx
    │   │   ├── dialog.tsx
    │   │   ├── select.tsx
    │   │   └── badge.tsx
    │   ├── Navbar.tsx               # 導航列元件
    │   └── HitPointCanvas.tsx      # 打擊落點畫布元件
    │
    ├── lib/                         # 工具函式庫
    │   ├── utils.ts                 # 通用工具函式
    │   ├── auth.ts                  # 認證相關函式
    │   └── supabase/                # Supabase 客戶端
    │       ├── client.ts            # 瀏覽器端客戶端
    │       ├── server.ts            # 伺服器端客戶端
    │       └── middleware.ts        # Middleware 客戶端
    │
    └── middleware.ts                # Next.js Middleware
```

## 主要檔案說明

### 資料庫相關
- `supabase/migrations/001_initial_schema.sql`
  - 建立所有資料表（profiles, players, atbats）
  - 設定 RLS (Row Level Security) 規則
  - 建立自動建立 profile 的 trigger

### 認證相關
- `src/lib/auth.ts`
  - `getSession()`: 取得目前使用者資訊和角色
  - `requireAuth()`: 要求使用者必須登入
  - `requireRole()`: 要求使用者必須有特定角色

### Supabase 客戶端
- `src/lib/supabase/client.ts`: 瀏覽器端使用
- `src/lib/supabase/server.ts`: 伺服器端使用
- `src/lib/supabase/middleware.ts`: Middleware 使用

### API 路由
所有 API 路由都包含：
- 認證檢查
- 角色權限檢查
- 錯誤處理
- 標準 JSON 回應

### 前端頁面
- `/login`: 登入頁面
- `/`: 首頁（球員列表）
- `/players/[id]`: 球員詳細頁面
- `/record/[player_id]`: 記錄打擊頁面
- `/record/[player_id]/hitpoint`: 標記打擊落點頁面
- `/stats/[player_id]`: 打擊統計頁面
- `/admin/users`: 使用者管理頁面（admin only）

### 元件
- `Navbar`: 導航列，顯示使用者資訊和角色
- `HitPointCanvas`: 可互動的棒球場畫布，用於標記打擊落點

## 資料流程

### 使用者登入流程
1. 使用者在 `/login` 輸入帳密
2. Supabase Auth 驗證
3. 系統檢查是否有對應的 profile
4. 如果沒有，自動建立 viewer 角色的 profile
5. 導向首頁

### 打擊紀錄流程
1. Editor/Admin 在首頁點擊「新增打擊紀錄」
2. 填寫打擊資訊（是否接觸、品質、結果等）
3. 如果接觸到球，導向落點標記頁面
4. 點擊球場標記落點
5. 儲存完成，導向球員詳細頁面

### 權限檢查流程
1. Middleware 檢查使用者是否登入
2. API 路由檢查使用者角色
3. 前端頁面根據角色顯示/隱藏功能按鈕
4. RLS 在資料庫層面確保資料安全

## 環境變數

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 下一步

1. 建立 PWA 圖示（icon-192.png, icon-512.png）
2. 設定 Supabase 專案
3. 執行資料庫 migration
4. 建立第一個 admin 使用者
5. 開始使用系統！



