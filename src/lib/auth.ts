import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // 使用更直接的方式讀取 profile，並加入錯誤處理和調試
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // 調試資訊
  if (profileError) {
    console.error('Error fetching profile:', {
      error: profileError,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      code: profileError.code,
      user_id: user.id,
    });
  }

  // 如果讀取失敗，記錄錯誤並嘗試建立 profile
  if (profileError || !profile) {
    
    // 嘗試建立 profile
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      role: 'viewer',
    });

    if (insertError) {
      console.error('Error creating profile:', insertError);
      // 如果建立也失敗，可能是 RLS 問題，使用預設值
      return {
        id: user.id,
        email: user.email || '',
        role: 'viewer' as UserRole,
      };
    }

    // 重新讀取剛建立的 profile
    const { data: newProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email || '',
      role: (newProfile?.role as UserRole) || 'viewer',
    };
  }

  return {
    id: user.id,
    email: user.email || '',
    role: profile.role as UserRole,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<SessionUser> {
  const session = await requireAuth();
  if (!allowedRoles.includes(session.role)) {
    redirect('/');
  }
  return session;
}