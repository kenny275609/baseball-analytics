'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

export function Navbar() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  // 換頁時重新取得使用者資訊（登入後導回首頁時才會立刻顯示）
  useEffect(() => {
    fetchUser();
  }, [pathname]);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/getSession');
      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500';
      case 'editor':
        return 'bg-blue-500';
      case 'viewer':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <nav className="border-b bg-white">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">⚾ Baseball Keep Web</h1>
          </div>
        </div>
      </nav>
    );
  }

  const navLink = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`text-sm font-medium px-2 py-1 rounded-md ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-600'}`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-lg font-bold mr-1">⚾</Link>
            {user && navLink('/', '比賽', pathname === '/' || pathname.startsWith('/games'))}
            {user && navLink('/players', '球員', pathname.startsWith('/players') || pathname.startsWith('/stats'))}
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-sm text-gray-600">{user.email}</span>
                  <Badge className={getRoleColor(user.role)}>
                    {user.role === 'admin' ? '管理員' : user.role === 'editor' ? '編輯者' : '檢視者'}
                  </Badge>
                </div>
                {user.role === 'admin' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/admin/users')}
                  >
                    使用者
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  登出
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
