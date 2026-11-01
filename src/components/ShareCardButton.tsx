'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShareCardData } from '@/lib/shareCard';
import { CARD_WIDTH, drawShareCard, shareCardHeight } from '@/lib/shareCardCanvas';

// 賽後戰報：在瀏覽器用 canvas 畫成 PNG，可下載或用 Web Share API 分享到 LINE
export function ShareCardButton({ data, fileName }: { data: ShareCardData; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);

  // 離開頁面時釋放圖片記憶體
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  // 按下按鈕才畫（每次都用最新的比賽資料重畫）
  const generate = () => {
    setMsg('');
    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = shareCardHeight(data);
    const ctx = canvas.getContext('2d');
    if (!ctx) return setMsg('這個瀏覽器無法產生圖片');
    drawShareCard(ctx, data);
    canvas.toBlob((blob) => {
      if (!blob) return setMsg('產生圖片失敗');
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      blobRef.current = blob;
      urlRef.current = URL.createObjectURL(blob);
      setUrl(urlRef.current);
    }, 'image/png');
  };

  const close = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    blobRef.current = null;
    setUrl(null);
  };

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const share = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    const payload = { files: [file], title: data.title, text: `${data.title} 賽後戰報` };
    if (typeof navigator.share !== 'function' || (navigator.canShare && !navigator.canShare(payload))) {
      setMsg('這個瀏覽器不支援直接分享圖片，請先下載再傳到 LINE');
      return;
    }
    try {
      await navigator.share(payload);
      setMsg('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('分享失敗，請改用下載');
    }
  };

  if (!url) {
    return (
      <div className="space-y-1">
        <Button variant="outline" onClick={generate}>
          📣 產生賽後戰報圖
        </Button>
        {msg && <p className="text-sm text-amber-700">{msg}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="賽後戰報" className="w-full rounded-md border" />
      <div className="flex flex-wrap gap-2">
        <Button onClick={share}>分享到 LINE…</Button>
        <Button variant="outline" onClick={download}>下載圖片</Button>
        <Button variant="outline" onClick={generate}>重新產生</Button>
        <Button variant="ghost" onClick={close}>收起</Button>
      </div>
      {msg && <p className="text-sm text-amber-700">{msg}</p>}
    </div>
  );
}
