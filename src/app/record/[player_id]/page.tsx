'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

export default function RecordPage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.player_id as string;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [contacted, setContacted] = useState(true);
  const [noContact, setNoContact] = useState('');
  const [quality, setQuality] = useState('');
  const [result, setResult] = useState('');
  const [outType, setOutType] = useState('');
  const [rbi, setRbi] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/getSession');
      const data = await response.json();
      setUser(data.user);
      if (data.user?.role === 'viewer') {
        router.push('/');
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/atbats/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          contacted,
          no_contact: contacted ? null : noContact,
          quality: contacted ? quality : null,
          result: contacted ? result : null,
          out_type: contacted && result === 'out' ? outType : null,
          rbi,
          note,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (contacted && quality && result) {
          // Redirect to hit point page
          router.push(`/record/${playerId}/hitpoint?atbat_id=${data.atbat.id}`);
        } else {
          router.push(`/players/${playerId}`);
        }
      }
    } catch (error) {
      console.error('Error creating atbat:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>新增打擊紀錄</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>是否接觸到球？</Label>
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant={contacted ? 'default' : 'outline'}
                  onClick={() => setContacted(true)}
                >
                  是
                </Button>
                <Button
                  type="button"
                  variant={!contacted ? 'default' : 'outline'}
                  onClick={() => setContacted(false)}
                >
                  否
                </Button>
              </div>
            </div>

            {!contacted ? (
              <div className="space-y-2">
                <Label htmlFor="no_contact">未接觸原因</Label>
                <Select value={noContact} onValueChange={setNoContact}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇原因" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strikeout">三振</SelectItem>
                    <SelectItem value="walk">保送</SelectItem>
                    <SelectItem value="hit_by_pitch">觸身球</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="quality">擊球品質</Label>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇品質" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hard">強勁</SelectItem>
                      <SelectItem value="medium">中等</SelectItem>
                      <SelectItem value="soft">軟弱</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="result">結果</Label>
                  <Select value={result} onValueChange={setResult}>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇結果" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">一壘安打</SelectItem>
                      <SelectItem value="double">二壘安打</SelectItem>
                      <SelectItem value="triple">三壘安打</SelectItem>
                      <SelectItem value="homerun">全壘打</SelectItem>
                      <SelectItem value="sacrifice">犧牲打</SelectItem>
                      <SelectItem value="out">出局</SelectItem>
                      <SelectItem value="error">失誤</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {result === 'out' && (
                  <div className="space-y-2">
                    <Label htmlFor="out_type">出局類型</Label>
                    <Select value={outType} onValueChange={setOutType}>
                      <SelectTrigger>
                        <SelectValue placeholder="選擇出局類型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flyout">接殺</SelectItem>
                        <SelectItem value="groundout">刺殺</SelectItem>
                        <SelectItem value="double_play">雙殺</SelectItem>
                        <SelectItem value="triple_play">三殺</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="rbi">打點 (RBI)</Label>
              <Input
                id="rbi"
                type="number"
                min="0"
                value={rbi}
                onChange={(e) => setRbi(parseInt(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">備註</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="額外說明..."
              />
            </div>

            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '儲存中...' : '下一步'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
