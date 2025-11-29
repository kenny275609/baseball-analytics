'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HitPointCanvas } from '@/components/HitPointCanvas';

export default function HitPointPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const playerId = params.player_id as string;
  const atbatId = searchParams.get('atbat_id');
  const [hitX, setHitX] = useState<number | null>(null);
  const [hitY, setHitY] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (atbatId) {
      fetchExistingHitPoint();
    } else {
      setLoading(false);
    }
  }, [atbatId, playerId]);

  const fetchExistingHitPoint = async () => {
    try {
      const response = await fetch(`/api/atbats/list?player=${playerId}`);
      const data = await response.json();
      const atbat = data.atbats?.find((a: any) => a.id === atbatId);
      
      if (atbat && atbat.hit_x !== null && atbat.hit_y !== null) {
        setHitX(atbat.hit_x);
        setHitY(atbat.hit_y);
      }
    } catch (error) {
      console.error('Error fetching existing hit point:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePointSelect = (x: number, y: number) => {
    setHitX(x);
    setHitY(y);
  };

  const handleSubmit = async () => {
    if (hitX === null || hitY === null || !atbatId) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/atbats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: atbatId,
          hit_x: hitX,
          hit_y: hitY,
        }),
      });

      if (response.ok) {
        // 如果從編輯頁面來，返回編輯頁面；否則返回球員頁面
        const referrer = document.referrer;
        if (referrer.includes('/edit/')) {
          router.back();
        } else {
          router.push(`/players/${playerId}`);
        }
      }
    } catch (error) {
      console.error('Error updating hit point:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    // 如果從編輯頁面來，返回編輯頁面；否則返回球員頁面
    const referrer = document.referrer;
    if (referrer.includes('/edit/')) {
      router.back();
    } else {
      router.push(`/players/${playerId}`);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center py-12">載入中...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>標記打擊落點</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <HitPointCanvas
              initialX={hitX}
              initialY={hitY}
              onPointSelect={handlePointSelect}
            />

            <div className="flex gap-4 justify-end">
              <Button variant="outline" onClick={handleSkip}>
                跳過
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={hitX === null || hitY === null || submitting}
              >
                {submitting ? '儲存中...' : '完成'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
