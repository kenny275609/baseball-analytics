'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Player {
  id: string;
  name: string;
  number: string | null;
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewGamePage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameDate, setGameDate] = useState(todayLocal());
  const [opponent, setOpponent] = useState('');
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home');
  const [lineup, setLineup] = useState<string[]>([]);
  const [lastGameId, setLastGameId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/players/list')
      .then((res) => res.json())
      .then((data) => setPlayers(data.players || []));
    fetch('/api/games/list')
      .then((res) => res.json())
      .then((data) => setLastGameId(data.games?.[0]?.id ?? null));
  }, []);

  const byId = new Map(players.map((p) => [p.id, p]));
  const bench = players
    .filter((p) => !lineup.includes(p.id))
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  const copyLastLineup = async () => {
    if (!lastGameId) return;
    const res = await fetch(`/api/games/get?id=${lastGameId}`);
    const data = await res.json();
    setLineup((data.lineup || []).map((l: { player_id: string }) => l.player_id));
  };

  const move = (index: number, delta: number) => {
    const next = [...lineup];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLineup(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!opponent.trim()) return setError('請輸入對手');
    if (lineup.length === 0) return setError('請至少排一位打者');

    setSubmitting(true);
    try {
      const res = await fetch('/api/games/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_date: gameDate, opponent, home_away: homeAway, lineup }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/games/${data.game.id}`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '建立失敗');
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <Link href="/">
        <Button variant="outline" size="sm" className="mb-4">← 返回</Button>
      </Link>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>比賽資訊</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="date">日期</Label>
                <Input id="date" type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>主客場</Label>
                <div className="flex gap-2">
                  {(['home', 'away'] as const).map((v) => (
                    <Button key={v} type="button" className="flex-1" variant={homeAway === v ? 'default' : 'outline'} onClick={() => setHomeAway(v)}>
                      {v === 'home' ? '主場' : '客場'}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="opponent">對手</Label>
              <Input id="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="對手隊名" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>打序</CardTitle>
            {lastGameId && (
              <Button type="button" variant="outline" size="sm" onClick={copyLastLineup}>
                沿用上一場
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {lineup.length === 0 ? (
              <p className="text-sm text-gray-500">點下方球員依序加入打序</p>
            ) : (
              <ol className="space-y-1">
                {lineup.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <span className="w-6 font-bold text-gray-500">{i + 1}</span>
                    <span className="flex-1">
                      {byId.get(id)?.name ?? '（已刪除的球員）'}
                      {byId.get(id)?.number && <span className="text-gray-500 ml-1">#{byId.get(id)?.number}</span>}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === lineup.length - 1}>↓</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLineup(lineup.filter((x) => x !== id))}>✕</Button>
                  </li>
                ))}
              </ol>
            )}
            {bench.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {bench.map((p) => (
                  <Button key={p.id} type="button" variant="outline" size="sm" onClick={() => setLineup([...lineup, p.id])} disabled={lineup.length >= 20}>
                    {p.number && `#${p.number} `}{p.name}
                  </Button>
                ))}
              </div>
            )}
            {players.length === 0 && (
              <p className="text-sm text-gray-500">
                還沒有球員，請先到 <Link href="/players" className="underline">球員名單</Link> 新增
              </p>
            )}
          </CardContent>
        </Card>

        {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? '建立中...' : '開始比賽'}
        </Button>
      </form>
    </div>
  );
}
