'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/useSession';

// 新註冊、尚未核准的帳號會被 Navbar 導到這裡；核准後重新整理就會回首頁
export default function PendingPage() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== 'pending') {
      router.replace('/');
    }
  }, [loading, user, router]);

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">⚾ 帳號待管理員核准</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center text-sm text-gray-600">
          {user?.email && <p className="font-medium text-gray-900">{user.email}</p>}
          <p>你的帳號已註冊成功，但需要管理員核准後才能查看資料。</p>
          <p>請聯絡球隊管理員開通權限，核准後重新整理此頁即可。</p>
          <Button className="mt-2" onClick={() => window.location.reload()}>
            重新整理
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
