'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AtbatDraft, AtbatEntry, EMPTY_DRAFT } from '@/components/AtbatEntry';
import { useSession } from '@/lib/useSession';
import { AtbatResultFields, fieldsToResult } from '@/lib/atbat';

interface AtbatData extends AtbatResultFields {
  id: string;
  quality: string | null;
  rbi: number;
  hit_x: number | null;
  hit_y: number | null;
  note: string | null;
  inning: number | null;
  batting_order: number | null;
  players: { name: string } | null;
}

export default function EditAtbatPage() {
  const params = useParams();
  const router = useRouter();
  const atbatId = params.atbat_id as string;
  const { user, loading: sessionLoading, canEdit } = useSession();
  const [atbat, setAtbat] = useState<AtbatData | null>(null);
  const [draft, setDraft] = useState<AtbatDraft>(EMPTY_DRAFT);
  const [inning, setInning] = useState<number | null>(null);
  // 已載入的打席 id；和網址不符就是載入中，換打席時不會顯示或送出上一筆
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const loading = loadedId !== atbatId;

  useEffect(() => {
    if (!sessionLoading && user && !canEdit) router.push('/');
  }, [sessionLoading, user, canEdit, router]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    fetch(`/api/atbats/${atbatId}`, { signal })
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`fetch atbat failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const found: AtbatData | null = data?.atbat ?? null;
        setLoadedId(atbatId);
        setAtbat(found);
        setError('');
        if (!found) return;
        setInning(found.inning);
        setDraft({
          result: fieldsToResult(found),
          quality: found.quality,
          rbi: found.rbi ?? 0,
          hitX: found.hit_x,
          hitY: found.hit_y,
          note: found.note ?? '',
        });
      })
      .catch((err) => {
        if (signal.aborted) return;
        console.error('Error fetching atbat:', err);
        setLoadedId(atbatId);
        setAtbat(null);
        setError('載入失敗，請稍後再試');
      });

    return () => controller.abort();
  }, [atbatId]);

  const handleSubmit = async () => {
    if (loading || !atbat || !draft.result) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/atbats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: atbatId,
          result: draft.result,
          quality: draft.quality,
          rbi: draft.rbi,
          hit_x: draft.hitX,
          hit_y: draft.hitY,
          note: draft.note,
          inning,
          batting_order: atbat.batting_order,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.warning) window.alert(data.warning);
      router.back();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '儲存失敗');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">載入中...</div>;
  }
  if (!atbat) {
    return <div className={`text-center py-12 ${error ? 'text-red-600' : 'text-gray-500'}`}>{error || '找不到這筆打席'}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>編輯打席：{atbat.players?.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">局數</span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setInning(Math.max(1, (inning ?? 1) - 1))}>◀</Button>
            <span className="w-14 text-center font-bold">{inning ? `${inning} 局` : '—'}</span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setInning(Math.min(30, (inning ?? 0) + 1))}>▶</Button>
          </div>

          <AtbatEntry draft={draft} onChange={setDraft} />

          {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
            <Button onClick={handleSubmit} disabled={!draft.result || submitting}>
              {submitting ? '儲存中...' : '儲存變更'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
