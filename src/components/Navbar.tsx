'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/roles';
import { useSession } from '@/lib/useSession';

export function Navbar() {
  const { user, loading, clear } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clear();
    router.push('/login');
    router.refresh();
  };

  // 尚未核准的帳號一律導到待核准頁
  const isPending = user?.role === 'pending';
  useEffect(() => {
    if (isPending && pathname !== '/pending') {
      router.replace('/pending');
    }
  }, [isPending, pathname, router]);

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
            {user && !isPending && navLink('/', '比賽', pathname === '/' || pathname.startsWith('/games'))}
            {user && !isPending && navLink('/players', '球員', pathname.startsWith('/players') || pathname.startsWith('/stats'))}
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-sm text-gray-600">{user.email}</span>
                  <Badge className={ROLE_COLORS[user.role] ?? 'bg-gray-500'}>
                    {ROLE_LABELS[user.role] ?? user.role}
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
