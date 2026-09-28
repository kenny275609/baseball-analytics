'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SprayChart } from '@/components/SprayChart';
import { AtbatResultFields, computeStats, fieldsToResult, formatRate, getResultOption } from '@/lib/atbat';

interface Atbat extends AtbatResultFields {
  id: string;
  rbi: number;
  hit_x: number | null;
  hit_y: number | null;
}

export default function StatsPage() {
  const params = useParams();
  const playerId = params.player_id as string;
  const [atbats, setAtbats] = useState<Atbat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/atbats/list?player=${playerId}`)
      .then((res) => res.json())
      .then((data) => setAtbats(data.atbats || []))
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) {
    return <div className="text-center py-12">載入中...</div>;
  }

  const s = computeStats(atbats);
  const hitPoints = atbats
    .filter((a) => a.hit_x !== null && a.hit_y !== null)
    .map((a) => ({ x: a.hit_x!, y: a.hit_y!, group: getResultOption(fieldsToResult(a))?.group }));

  const rates = [
    { label: '打擊率 AVG', value: s.avg, detail: `${s.h} 安 / ${s.ab} 打數` },
    { label: '上壘率 OBP', value: s.obp, detail: `${s.h + s.bb + s.hbp} 次上壘` },
    { label: '長打率 SLG', value: s.slg, detail: `${s.tb} 壘打數` },
    { label: 'OPS', value: s.ops, detail: 'OBP + SLG' },
  ];
  const counts = [
    ['打席', s.pa], ['打數', s.ab], ['安打', s.h], ['二安', s.b2], ['三安', s.b3],
    ['全壘打', s.hr], ['打點', s.rbi], ['保送', s.bb], ['觸身', s.hbp], ['三振', s.so], ['犧牲', s.sac],
  ] as const;

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
      <Link href={`/players/${playerId}`}>
        <Button variant="outline" size="sm">← 返回</Button>
      </Link>
      <h1 className="text-2xl font-bold">打擊統計</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {rates.map((r) => (
          <Card key={r.label} className="gap-1 py-4">
            <CardContent>
              <div className="text-xs text-gray-500">{r.label}</div>
              <div className="text-3xl font-bold tabular-nums">{formatRate(r.value)}</div>
              <div className="text-xs text-gray-500 mt-1">{r.detail}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="py-4">
        <CardContent className="grid grid-cols-4 sm:grid-cols-6 gap-y-3 text-center">
          {counts.map(([label, value]) => (
            <div key={label}>
              <div className="text-lg font-bold tabular-nums">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>打擊落點分布</CardTitle>
        </CardHeader>
        <CardContent>
          {hitPoints.length > 0 ? (
            <SprayChart hitPoints={hitPoints} />
          ) : (
            <p className="text-center text-gray-500 py-8">尚無打擊落點資料</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
