'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SprayChart } from '@/components/SprayChart';

interface Atbat {
  id: string;
  contacted: boolean;
  quality: string | null;
  result: string | null;
  rbi: number;
  hit_x: number | null;
  hit_y: number | null;
  created_at: string;
}

export default function StatsPage() {
  const params = useParams();
  const playerId = params.player_id as string;
  const [atbats, setAtbats] = useState<Atbat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAtbats();
  }, [playerId]);

  const fetchAtbats = async () => {
    try {
      const response = await fetch(`/api/atbats/list?player=${playerId}`);
      const data = await response.json();
      setAtbats(data.atbats || []);
    } catch (error) {
      console.error('Error fetching atbats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const contactedAtbats = atbats.filter((a) => a.contacted);
  const totalAtbats = contactedAtbats.length;
  const hits = contactedAtbats.filter(
    (a) => a.result && ['single', 'double', 'triple', 'homerun'].includes(a.result)
  ).length;
  const avg = totalAtbats > 0 ? hits / totalAtbats : 0;

  // Calculate SLG (slugging percentage)
  const singles = contactedAtbats.filter((a) => a.result === 'single').length;
  const doubles = contactedAtbats.filter((a) => a.result === 'double').length;
  const triples = contactedAtbats.filter((a) => a.result === 'triple').length;
  const homeruns = contactedAtbats.filter((a) => a.result === 'homerun').length;
  const totalBases = singles + doubles * 2 + triples * 3 + homeruns * 4;
  const slg = totalAtbats > 0 ? totalBases / totalAtbats : 0;

  // Prepare hit points data for spray chart
  const hitPoints = contactedAtbats
    .filter((a) => a.hit_x !== null && a.hit_y !== null)
    .map((a) => ({
      x: a.hit_x!,
      y: a.hit_y!,
      result: a.result,
    }));

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">載入中...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">打擊統計</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>打擊率 (AVG)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {avg.toFixed(3)}
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {hits} / {totalAtbats} 打數
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>長打率 (SLG)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {slg.toFixed(3)}
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {totalBases} 總壘打數 / {totalAtbats} 打數
            </p>
          </CardContent>
        </Card>
      </div>

      {hitPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>打擊落點分布圖 (Spray Chart)</CardTitle>
          </CardHeader>
          <CardContent>
            <SprayChart hitPoints={hitPoints} width={600} height={600} />
          </CardContent>
        </Card>
      )}

      {hitPoints.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">尚無打擊落點資料</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
