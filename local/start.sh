#!/bin/bash
# 一鍵啟動本機版：Docker → 本機 Supabase → 網站（http://localhost:3000）
set -e
cd "$(dirname "$0")/.."

# 網站已經在跑就不要再開第二個（會搶 port 和 .next/dev/lock）
if pgrep -f "next dev" >/dev/null; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  echo "網站已經在執行中，不用再啟動 👍"
  echo "✓ 電腦開啟：http://localhost:3000"
  [ -n "$LAN_IP" ] && echo "✓ 手機開啟（同一個 Wi-Fi）：http://$LAN_IP:3000"
  echo "要重新啟動：先到原本那個終端機按 Ctrl+C，再執行 npm run local"
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "▶ 啟動 Docker..."
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 2; done
fi

echo "▶ 啟動本機資料庫（第一次會比較久）..."
supabase start -x studio,storage-api,imgproxy,realtime,edge-runtime,logflare,vector,postgres-meta,mailpit,supavisor >/dev/null

eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=')"

# 用區域網路 IP，同一個 Wi-Fi 的手機也能連；抓不到就用 localhost
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [ -n "$LAN_IP" ]; then
  API_URL="http://$LAN_IP:54321"
fi

echo ""
echo "✓ 電腦開啟：http://localhost:3000"
[ -n "$LAN_IP" ] && echo "✓ 手機開啟（同一個 Wi-Fi）：http://$LAN_IP:3000"
echo "  按 Ctrl+C 停止網站"
echo ""
NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" npm run dev -- --hostname 0.0.0.0
