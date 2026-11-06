'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BaseballField, FieldPoint } from '@/components/BaseballField';
import { PlayerFielding } from '@/components/PlayerFielding';
import { useSession } from '@/lib/useSession';
import {
  AtbatResultFields,
  computeStats,
  fieldsToResult,
  formatRate,
  getResultOption,
  qualityLabel,
} from '@/lib/atbat';

interface Atbat extends AtbatResultFields {
  id: string;
  player_id: string;
  game_id: string | null;
  inning: number | null;
  quality: string | null;
  rbi: number;
  hit_x: number | null;
  hit_y: number | null;
  note: string | null;
  created_at: string;
  players: { name: string; number: string | null } | null;
  games: { game_date: string; opponent: string } | null;
}

export default function PlayerPage() {
  const params = useParams();
  const playerId = params.id as string;
  const { canEdit } = useSession();
  // 抓回來的資料都標上 playerId；和目前網址不符就視為載入中，換球員時不會殘留上一位的資料
  const [atbatsData, setAtbatsData] = useState<{ playerId: string; atbats: Atbat[]; error: string } | null>(null);
  const [nameData, setNameData] = useState<{ playerId: string; name: string } | null>(null);
  const [viewPoint, setViewPoint] = useState<FieldPoint | null>(null);

  const loading = atbatsData?.playerId !== playerId;
  const atbats = loading ? [] : atbatsData.atbats;
  const error = loading ? '' : atbatsData.error;
  const playerName = nameData?.playerId === playerId ? nameData.name : '球員';

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const getJson = async (url: string) => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
      return res.json();
    };

    getJson(`/api/atbats/list?player=${playerId}`)
      .then((data) => setAtbatsData({ playerId, atbats: data.atbats || [], error: '' }))
      .catch((err) => {
        if (signal.aborted) return;
        console.error('Error fetching atbats:', err);
        setAtbatsData({ playerId, atbats: [], error: '打席紀錄載入失敗' });
      });
    getJson(`/api/players/${playerId}`)
      .then((data) => {
        const p = data.player;
        if (p) setNameData({ playerId, name: p.number ? `#${p.number} ${p.name}` : p.name });
      })
      .catch((err) => {
        if (!signal.aborted) console.error('Error fetching player:', err);
      });

    return () => controller.abort();
  }, [playerId]);

  const stats = computeStats(atbats);

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <Link href="/players">
        <Button variant="outline" size="sm" className="mb-4">← 球員名單</Button>
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{playerName}</h1>
          <p className="text-gray-600 text-sm mt-1">
            {stats.pa} 打席 · 打擊率 {formatRate(stats.avg)} · 上壘率 {formatRate(stats.obp)}
          </p>
        </div>
        <Link href={`/stats/${playerId}`}>
          <Button variant="outline">完整統計</Button>
        </Link>
      </div>

      <div className="mb-4">
        <PlayerFielding playerId={playerId} />
      </div>

      {loading ? (
        <div className="text-center py-12">載入中...</div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>
      ) : atbats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            尚無打席紀錄，打席請從「比賽」頁面記錄
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>比賽</TableHead>
                <TableHead>局</TableHead>
                <TableHead>結果</TableHead>
                <TableHead>品質</TableHead>
                <TableHead>打點</TableHead>
                <TableHead>落點</TableHead>
                <TableHead>備註</TableHead>
                {canEdit && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {atbats.map((a) => {
                const option = getResultOption(fieldsToResult(a));
                return (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      {a.games && a.game_id ? (
                        <Link href={`/games/${a.game_id}`} className="hover:underline">
                          {a.games.game_date.slice(5)} vs {a.games.opponent}
                        </Link>
                      ) : (
                        new Date(a.created_at).toLocaleDateString('zh-TW')
                      )}
                    </TableCell>
                    <TableCell>{a.inning ?? '-'}</TableCell>
                    <TableCell className="font-medium">{option?.label ?? '-'}</TableCell>
                    <TableCell>{qualityLabel(a.quality)}</TableCell>
                    <TableCell>{a.rbi}</TableCell>
                    <TableCell>
                      {a.hit_x !== null && a.hit_y !== null ? (
                        <button
                          onClick={() => setViewPoint({ x: a.hit_x!, y: a.hit_y!, group: option?.group })}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          查看
                        </button>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="max-w-40 truncate">{a.note || '-'}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <Link href={`/record/${playerId}/edit/${a.id}`}>
                          <Button variant="outline" size="sm">編輯</Button>
                        </Link>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={viewPoint !== null} onOpenChange={(open) => !open && setViewPoint(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>打擊落點</DialogTitle>
            <DialogDescription>此打席的落點位置</DialogDescription>
          </DialogHeader>
          {viewPoint && <BaseballField points={[viewPoint]} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
