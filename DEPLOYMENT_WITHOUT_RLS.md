# 🚀 不使用 RLS 的部署方案

## 可以運作，但需要確保應用層權限控制

對於**內部系統**（只有團隊成員使用），不使用 RLS 是可以的，但必須確保：

## ✅ 必須確保的安全措施

### 1. API 路由層面的權限控制（已實作）

我們的系統已經在 API 路由層面實作了完整的權限控制：

- ✅ `/api/auth/getSession` - 檢查使用者登入狀態
- ✅ `/api/players/*` - 檢查角色（editor/admin 才能新增/編輯）
- ✅ `/api/atbats/*` - 檢查角色（editor/admin 才能新增/編輯）
- ✅ `/api/admin/*` - 只允許 admin

所有 API 都使用 `requireAuth()` 和 `requireRole()` 來檢查權限。

### 2. 環境變數安全

- ✅ 使用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`（這是公開的，沒問題）
- ⚠️ **絕對不要**在前端暴露 Service Role Key
- ✅ 所有敏感操作都在 server-side API 路由中進行

### 3. 前端權限控制（已實作）

- ✅ 根據角色顯示/隱藏功能按鈕
- ✅ 前端會檢查角色，但真正的權限控制在 API

## 📋 部署檢查清單

### 部署前確認

- [ ] 所有 API 路由都有 `requireAuth()` 或 `requireRole()` 檢查
- [ ] 沒有在前端直接使用 Supabase client 進行敏感操作
- [ ] 環境變數已正確設定（`.env.local` → 部署平台的環境變數）
- [ ] RLS 已禁用（如果選擇不使用 RLS）

### 部署步驟

1. **設定環境變數**
   - 在部署平台（Vercel/Netlify 等）設定：
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2. **禁用 RLS（如果選擇）**
   ```sql
   ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
   ALTER TABLE players DISABLE ROW LEVEL SECURITY;
   ALTER TABLE atbats DISABLE ROW LEVEL SECURITY;
   ```

3. **部署應用程式**
   - 推送到 GitHub
   - 在 Vercel/Netlify 中部署

## ⚠️ 安全考量

### 優點

- ✅ 簡化設定，避免 RLS 規則問題
- ✅ 所有權限控制在應用層，更容易除錯
- ✅ 對於內部系統，這是可接受的方案

### 缺點

- ⚠️ 如果 API 有漏洞，可能被繞過
- ⚠️ 如果直接訪問 Supabase，沒有資料庫層面的保護
- ⚠️ 需要確保所有 API 都有正確的權限檢查

## 🔒 最佳實踐

### 1. 確保所有 API 都有權限檢查

我們已經實作了，但部署前請再次確認：

```typescript
// ✅ 正確：有權限檢查
export async function POST() {
  await requireRole(['editor', 'admin']);
  // ... 執行操作
}

// ❌ 錯誤：沒有權限檢查
export async function POST() {
  // 直接執行操作，沒有檢查
}
```

### 2. 不要在前端直接操作 Supabase

```typescript
// ❌ 錯誤：在前端直接操作
const { data } = await supabase.from('players').insert({...});

// ✅ 正確：透過 API 路由
const response = await fetch('/api/players/create', {
  method: 'POST',
  body: JSON.stringify({...})
});
```

### 3. 定期檢查 API 安全性

- 定期檢查 API 路由是否有遺漏的權限檢查
- 使用測試工具檢查 API 端點

## 🎯 結論

**對於內部系統，不使用 RLS 是可以的**，只要：

1. ✅ 所有 API 路由都有正確的權限檢查（已實作）
2. ✅ 不在前端直接操作 Supabase（已實作）
3. ✅ 環境變數安全設定（需要確認）

## 建議

如果 RLS 規則一直有問題，對於內部系統來說，**暫時禁用 RLS 並在應用層控制權限是可行的方案**。

---

© 2024 Baseball Keep Web
