#!/bin/bash
# 關閉本機資料庫（資料會保留，下次啟動還在）
cd "$(dirname "$0")/.."
supabase stop
