'use client';

import { useEffect, useState } from 'react';

export interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/getSession')
      .then((res) => res.json())
      .then((data) => setUser(data.user ?? null))
      .catch((error) => console.error('Error fetching user:', error))
      .finally(() => setLoading(false));
  }, []);

  const canEdit = user?.role === 'editor' || user?.role === 'admin';
  return { user, loading, canEdit, isAdmin: user?.role === 'admin' };
}
