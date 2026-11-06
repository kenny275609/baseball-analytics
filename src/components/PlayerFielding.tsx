'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DefensePlay, FieldingCount, formatFieldingPct, playerFielding, positionLabel } from '@/lib/defense';

interface Data {
  ready: boolean;
  games: { id: string; game_date: string; opponent: string; status: string }[];
  plays: (DefensePlay & { game_id: string })[];
  positions: { game_id: string; position: number }[];
}

const Nums = ({ c }: { c: FieldingCount }) => (
  <>
    <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{c.po}</td>
    <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{c.a}</td>
    <td className={`whitespace-nowrap py-1 pl-2 text-right tabular-nums ${c.e ? 'text-red-600' : ''}`}>{c.e}</td>
    <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{formatFieldingPct(c)}</td>
  </>
);

const Head = ({ first }: { first: string }) => (
  <thead>
    <tr className="text-gray-500">
      <th className="whitespace-nowrap py-1 text-left font-normal">{first}</th>
      <th className="whitespace-nowrap py-1 pl-2 text-right font-normal">刺殺</th>
      <th className="whitespace-nowrap py-1 pl-2 text-right font-normal">助殺</th>
      <th className="whitespace-nowrap py-1 pl-2 text-right font-normal">失誤</th>
      <th className="whitespace-nowrap py-1 pl-2 text-right font-normal">守備率</th>
    </tr>
  </thead>
);

// 球員頁的守備成績：整季分守備位置合計，下面逐場列出
export function PlayerFielding({ playerId }: { playerId: string }) {
  const [data, setData] = useState<{ playerId: string; data: Data | null; error: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/defense/player?player_id=${playerId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        setData({ playerId, data: await res.json(), error: '' });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Error fetching fielding:', err);
        setData({ playerId, data: null, error: '守備成績載入失敗' });
      });
    return () => controller.abort();
  }, [playerId]);

  if (data?.playerId !== playerId) return null;
  if (data.error) return <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{data.error}</div>;
  const d = data.data!;
  if (!d.ready || d.games.length === 0) return null;

  const { season, games } = playerFielding(
    d.plays,
    playerId,
    d.games.map((g) => g.id),
    d.positions,
  );
  const gameById = new Map(d.games.map((g) => [g.id, g]));

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">守備成績</CardTitle>
        <p className="text-sm text-gray-600">
          {games.length} 場 · 守備率 {formatFieldingPct(season)}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <table className="w-full text-sm">
          <Head first="守備位置" />
          <tbody>
            {season.byPosition.length > 1 &&
              season.byPosition.map((b) => (
                <tr key={b.pos} className="border-t">
                  <td className="py-1 text-gray-600">{positionLabel(b.pos)}</td>
                  <Nums c={b} />
                </tr>
              ))}
            <tr className="border-t font-medium">
              <td className="py-1">{season.byPosition.length === 1 ? positionLabel(season.byPosition[0].pos) : '整季合計'}</td>
              <Nums c={season} />
            </tr>
          </tbody>
        </table>

        <div>
          <div className="mb-1 text-sm font-semibold text-gray-700">每場紀錄</div>
          <table className="w-full text-sm">
            <Head first="比賽 / 位置" />
            <tbody>
              {games.map((g) => {
                const game = gameById.get(g.gameId)!;
                return (
                  <tr key={g.gameId} className="border-t align-top">
                    <td className="py-1.5">
                      <Link href={`/games/${g.gameId}/defense`} className="hover:underline">
                        {game.game_date.slice(5)} vs {game.opponent}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {g.positions.map(positionLabel).join('、')}
                        {g.po + g.a + g.e === 0 && '（無守備機會）'}
                        {game.status === 'live' && '（進行中）'}
                      </div>
                    </td>
                    <Nums c={g} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
