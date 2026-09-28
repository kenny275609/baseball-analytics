#!/bin/bash
# 把某個帳號設成管理員：npm run local:admin -- 你的email
set -e
cd "$(dirname "$0")/.."
EMAIL="$1"
if [ -z "$EMAIL" ]; then
  echo "用法：npm run local:admin -- 你的email"
  exit 1
fi
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_baseball_web_local$' || true)
if [ -z "$DB" ]; then
  echo "本機資料庫沒有在跑，請先執行 npm run local"
  exit 1
fi
RESULT=$(docker exec -i "$DB" psql -U postgres -qtAc \
  "UPDATE profiles SET role='admin' WHERE id=(SELECT id FROM auth.users WHERE email='$(printf '%s' "$EMAIL" | sed "s/'/''/g")') RETURNING id;")
if [ -z "$RESULT" ]; then
  echo "找不到 $EMAIL，請先在網站上註冊這個帳號"
  exit 1
fi
echo "✓ $EMAIL 已設為管理員，回網站重新整理即可"
