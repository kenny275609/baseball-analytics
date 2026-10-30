'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/lib/useSession';
import { ASSIGNABLE_ROLES, ROLE_COLORS, ROLE_LABELS, type UserRole } from '@/lib/roles';

interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();
  const { user: currentUser } = useSession();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (response.status === 403) {
        router.push('/');
        return;
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdating(userId);
    setError('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: newRole }),
      });

      if (response.ok) {
        fetchUsers();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || '更新角色失敗');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      setError('更新角色失敗');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">載入中...</div>
      </div>
    );
  }

  // 待核准的排最前面
  const pendingCount = users.filter((u) => u.role === 'pending').length;
  const sortedUsers = [...users].sort(
    (a, b) => Number(b.role === 'pending') - Number(a.role === 'pending')
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">使用者管理</h1>

      {pendingCount > 0 && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          有 {pendingCount} 位新註冊的使用者等待核准，請在下方將角色改為檢視者、編輯者或管理員。
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>所有使用者</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>電子郵件</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>建立時間</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <TableRow key={user.id} className={user.role === 'pending' ? 'bg-amber-50' : undefined}>
                    <TableCell className="font-medium">
                      {user.email}
                      {isSelf && <span className="ml-1 text-xs text-gray-500">（你）</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={ROLE_COLORS[user.role] ?? 'bg-gray-500'}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString('zh-TW')}
                    </TableCell>
                    <TableCell>
                      {isSelf ? (
                        <span className="text-xs text-gray-500">不能修改自己的角色</span>
                      ) : (
                        <Select
                          value={user.role}
                          onValueChange={(value) => handleRoleChange(user.id, value as UserRole)}
                          disabled={updating === user.id}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
