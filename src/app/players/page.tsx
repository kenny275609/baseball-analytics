'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Player {
  id: string;
  name: string;
  number: string | null;
  created_at: string;
}

interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUser();
    fetchPlayers();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/getSession');
      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  const fetchPlayers = async () => {
    try {
      const response = await fetch('/api/players/list');
      const data = await response.json();
      setPlayers(data.players || []);
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/players/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, number }),
      });

      const data = await response.json();

      if (response.ok) {
        setOpen(false);
        setName('');
        setNumber('');
        fetchPlayers();
      } else {
        setError(data.error || '建立失敗');
      }
    } catch (error) {
      console.error('Error creating player:', error);
      setError('建立失敗，請稍後再試');
    }
  };

  const handleEditPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlayer) return;
    
    setError('');
    try {
      const response = await fetch('/api/players/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPlayer.id,
          name,
          number,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setEditOpen(false);
        setEditingPlayer(null);
        setName('');
        setNumber('');
        fetchPlayers();
      } else {
        setError(data.error || '更新失敗');
      }
    } catch (error) {
      console.error('Error updating player:', error);
      setError('更新失敗，請稍後再試');
    }
  };

  const handleDeletePlayer = async () => {
    if (!deletingPlayer) return;

    try {
      const response = await fetch('/api/players/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingPlayer.id }),
      });

      if (response.ok) {
        setDeleteOpen(false);
        setDeletingPlayer(null);
        fetchPlayers();
      }
    } catch (error) {
      console.error('Error deleting player:', error);
    }
  };

  const openEditDialog = (player: Player) => {
    setEditingPlayer(player);
    setName(player.name);
    setNumber(player.number || '');
    setError('');
    setEditOpen(true);
  };

  const openDeleteDialog = (player: Player) => {
    setDeletingPlayer(player);
    setDeleteOpen(true);
  };

  const canEdit = user?.role === 'editor' || user?.role === 'admin';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">球員名單</h1>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>新增球員</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新增球員</DialogTitle>
                <DialogDescription>請填寫球員基本資料</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreatePlayer} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">姓名 *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError('');
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number">背號</Label>
                  <Input
                    id="number"
                    value={number}
                    onChange={(e) => {
                      setNumber(e.target.value);
                      setError('');
                    }}
                    placeholder="選填"
                  />
                </div>
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full">
                  建立
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">載入中...</div>
      ) : players.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">尚無球員資料</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>背號</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium">{player.name}</TableCell>
                  <TableCell>{player.number || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Link href={`/players/${player.id}`}>
                        <Button variant="outline" size="sm">
                          查看紀錄
                        </Button>
                      </Link>
                      {canEdit && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(player)}
                          >
                            編輯
                          </Button>
                          {user?.role === 'admin' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeleteDialog(player)}
                            >
                              刪除
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* 編輯球員對話框 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯球員</DialogTitle>
            <DialogDescription>修改球員基本資料</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditPlayer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">姓名 *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-number">背號</Label>
              <Input
                id="edit-number"
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setError('');
                }}
                placeholder="選填"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setEditOpen(false);
                  setEditingPlayer(null);
                  setName('');
                  setNumber('');
                  setError('');
                }}
              >
                取消
              </Button>
              <Button type="submit" className="flex-1">
                儲存
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 刪除確認對話框 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              您確定要刪除球員「{deletingPlayer?.name}」嗎？此操作無法復原，且會一併刪除該球員的所有打擊紀錄。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePlayer}
              className="bg-red-600 hover:bg-red-700"
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}