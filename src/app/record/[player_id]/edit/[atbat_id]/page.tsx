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
  const playerId = params.player_id as string;
  const atbatId = params.atbat_id as string;
  const { user, loading: sessionLoading, canEdit } = useSession();
  const [atbat, setAtbat] = useState<AtbatData | null>(null);
  const [draft, setDraft] = useState<AtbatDraft>(EMPTY_DRAFT);
  const [inning, setInning] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionLoading && user && !canEdit) router.push('/');
  }, [sessionLoading, user, canEdit, router]);

  useEffect(() => {
    fetch(`/api/atbats/list?player=${playerId}`)
      .then((res) => res.json())
      .then((data) => {
        const found: AtbatData | undefined = data.atbats?.find((a: AtbatData) => a.id === atbatId);
        if (!found) return;
        setAtbat(found);
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
      .finally(() => setLoading(false));
  }, [playerId, atbatId]);

  const handleSubmit = async () => {
    if (!atbat || !draft.result) return;
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
      if (!res.ok) throw new Error((await res.json()).error);
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
    return <div className="text-center py-12 text-gray-500">找不到這筆打席</div>;
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
