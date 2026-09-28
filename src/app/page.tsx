'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/lib/useSession';

interface Game {
  id: string;
  game_date: string;
  opponent: string;
  home_away: 'home' | 'away';
  status: 'live' | 'final';
  our_score: number | null;
  opp_score: number | null;
  atbats: { count: number }[];
}

export default function GamesPage() {
  const { canEdit } = useSession();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/games/list')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setGames(data.games);
      })
      .catch(() => setError('載入比賽失敗。若是第一次使用，請確認已執行 migration 011。'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">比賽</h1>
        {canEdit && (
          <Link href="/games/new">
            <Button>＋ 新比賽</Button>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">載入中...</div>
      ) : error ? (
        <Card><CardContent className="py-8 text-center text-red-600">{error}</CardContent></Card>
      ) : games.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            還沒有比賽紀錄{canEdit && '，按「新比賽」開始記錄'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {games.map((g) => (
            <Link key={g.id} href={`/games/${g.id}`} className="block">
              <Card className="py-0 hover:bg-gray-50 transition-colors">
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">
                      {g.game_date} · {g.home_away === 'home' ? '主場' : '客場'}
                    </div>
                    <div className="text-lg font-semibold">vs {g.opponent}</div>
                  </div>
                  <div className="text-right">
                    {g.status === 'live' ? (
                      <Badge className="bg-green-600">進行中</Badge>
                    ) : g.our_score !== null && g.opp_score !== null ? (
                      <div className="text-xl font-bold tabular-nums">
                        {g.our_score} : {g.opp_score}
                      </div>
                    ) : (
                      <Badge variant="outline">已結束</Badge>
                    )}
                    <div className="text-xs text-gray-500 mt-1">{g.atbats[0]?.count ?? 0} 個打席</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
