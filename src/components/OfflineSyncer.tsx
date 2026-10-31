'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { pendingGameIds, readQueue } from '@/lib/offlineQueue';
import { queueStorage, subscribe, syncAll } from '@/lib/offlineSync';

const RETRY_MS = 20000;

// 全站掛一個：App 打開、連線恢復、回到前景時同步所有比賽的離線紀錄；
// 有未同步紀錄時每 20 秒再試一次（iOS 常常顯示有連線但其實送不出去）。
// 不在該場比賽頁面時顯示提醒，避免紀錄一直留在手機裡沒發現
export function OfflineSyncer() {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ gameId: string; count: number; blocked: boolean }[]>([]);

  useEffect(() => {
    const refresh = () => {
      const storage = queueStorage();
      setPending(
        pendingGameIds(storage).map((gameId) => {
          const items = readQueue(storage, gameId);
          return { gameId, count: items.length, blocked: !!items[0]?.error };
        }).filter((p) => p.count > 0)
      );
    };
    const sync = () => {
      void syncAll().finally(refresh);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    refresh();
    sync();
    const unsubscribe = subscribe((e) => e.type === 'change' && refresh());
    window.addEventListener('online', sync);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      if (pendingGameIds(queueStorage()).length > 0) sync();
    }, RETRY_MS);
    return () => {
      unsubscribe();
      window.removeEventListener('online', sync);
      window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  const others = pending.filter((p) => pathname !== `/games/${p.gameId}`);
  if (others.length === 0) return null;
  return (
    <div className="container mx-auto max-w-2xl px-4 pt-3 space-y-2">
      {others.map((p) => (
        <Link
          key={p.gameId}
          href={`/games/${p.gameId}`}
          className={`block rounded-md p-3 text-sm ${p.blocked ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}
        >
          {p.blocked
            ? `有 ${p.count} 筆比賽紀錄同步失敗，點這裡處理`
            : `有 ${p.count} 筆比賽紀錄只存在這支手機，連線後會自動上傳（點這裡查看）`}
        </Link>
      ))}
    </div>
  );
}
