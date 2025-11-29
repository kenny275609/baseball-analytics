'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HitPointViewer } from '@/components/HitPointViewer';

interface Atbat {
  id: string;
  player_id: string;
  contacted: boolean;
  no_contact: string | null;
  quality: string | null;
  result: string | null;
  out_type: string | null;
  rbi: number;
  hit_x: number | null;
  hit_y: number | null;
  note: string | null;
  created_at: string;
  players: {
    name: string;
    number: string | null;
  };
}

interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id as string;
  const [atbats, setAtbats] = useState<Atbat[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHitPoint, setSelectedHitPoint] = useState<{ x: number; y: number } | null>(null);
  const [showHitPointDialog, setShowHitPointDialog] = useState(false);

  useEffect(() => {
    fetchUser();
    fetchAtbats();
  }, [playerId]);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/getSession');
      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

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

  const canEdit = user?.role === 'editor' || user?.role === 'admin';

  const playerName = atbats[0]?.players?.name || '球員';

  const getOutTypeLabel = (outType: string) => {
    const labels: Record<string, string> = {
      flyout: '接殺',
      groundout: '刺殺',
      double_play: '雙殺',
      triple_play: '三殺',
    };
    return labels[outType] || outType;
  };

  const getResultLabel = (result: string | null) => {
    if (!result) return '-';
    const labels: Record<string, string> = {
      single: '一壘安打',
      double: '二壘安打',
      triple: '三壘安打',
      homerun: '全壘打',
      sacrifice: '犧牲打',
      out: '出局',
      error: '失誤',
    };
    return labels[result] || result;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/">
          <Button variant="outline" size="sm" className="mb-4">
            ← 返回
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{playerName} 的打擊紀錄</h1>
            <p className="text-gray-600 mt-1">共 {atbats.length} 筆紀錄</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/stats/${playerId}`}>
              <Button variant="outline">查看統計</Button>
            </Link>
            {canEdit && (
              <Link href={`/record/${playerId}`}>
                <Button>新增打擊紀錄</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">載入中...</div>
      ) : atbats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">尚無打擊紀錄</p>
            {canEdit && (
              <Link href={`/record/${playerId}`}>
                <Button className="mt-4">新增第一筆紀錄</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>接觸</TableHead>
                <TableHead>品質</TableHead>
                <TableHead>結果</TableHead>
                <TableHead>打點</TableHead>
                <TableHead>落點</TableHead>
                <TableHead>備註</TableHead>
                {canEdit && <TableHead>操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {atbats.map((atbat) => (
                <TableRow key={atbat.id}>
                  <TableCell>
                    {new Date(atbat.created_at).toLocaleDateString('zh-TW')}
                  </TableCell>
                  <TableCell>
                    {atbat.contacted ? (
                      <Badge className="bg-green-500">是</Badge>
                    ) : (
                      <Badge variant="outline">{atbat.no_contact || '否'}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{atbat.quality || '-'}</TableCell>
                  <TableCell>
                    {getResultLabel(atbat.result)}
                    {atbat.result === 'out' && atbat.out_type && (
                      <span className="ml-2 text-sm text-gray-500">
                        ({getOutTypeLabel(atbat.out_type)})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{atbat.rbi}</TableCell>
                  <TableCell>
                    {atbat.hit_x !== null && atbat.hit_y !== null ? (
                      <button
                        onClick={() => {
                          setSelectedHitPoint({ x: atbat.hit_x!, y: atbat.hit_y! });
                          setShowHitPointDialog(true);
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        ({atbat.hit_x.toFixed(1)}, {atbat.hit_y.toFixed(1)})
                      </button>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {atbat.note || '-'}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Link href={`/record/${playerId}/edit/${atbat.id}`}>
                        <Button variant="outline" size="sm">
                          編輯
                        </Button>
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* 落點查看 Dialog */}
      <Dialog open={showHitPointDialog} onOpenChange={setShowHitPointDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>打擊落點位置</DialogTitle>
            <DialogDescription>
              查看此筆打擊紀錄的落點在球場上的位置
            </DialogDescription>
          </DialogHeader>
          {selectedHitPoint && (
            <div className="py-4">
              <HitPointViewer
                hitX={selectedHitPoint.x}
                hitY={selectedHitPoint.y}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
