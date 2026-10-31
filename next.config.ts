import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 離線時點連結不要整頁重新載入（沒有 service worker，整頁載入一定失敗）：
    // 已預先載入的頁面直接切換，其他的等恢復連線後自動繼續
    useOffline: true,
    // 頁面都是在瀏覽器端抓資料，預先載入的頁面骨架可以放久一點，比賽中斷網時才切得過去；
    // 開過的比賽頁等動態頁面也一樣（登出時 router.refresh() 會清掉這些快取）
    staleTimes: {
      static: 3600,
      dynamic: 3600,
    },
  },
};

export default nextConfig;
