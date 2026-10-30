import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { ASSIGNABLE_ROLES } from '@/lib/roles';

export async function GET() {
  try {
    const auth = await authorize(['admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    // 嘗試使用 SQL 函數來取得使用者資料（包含 email）
    const { data: usersData, error: rpcError } = await supabase.rpc(
      'get_users_with_profiles'
    );

    if (!rpcError && usersData) {
      // 如果 SQL 函數可用，直接使用
      return NextResponse.json({ users: usersData }, { status: 200 });
    }

    // 如果 SQL 函數不可用，使用替代方案：只讀取 profiles，email 暫時為空
    console.warn('RPC function not available, using fallback method');
    
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, role, created_at')
      .order('created_at', { ascending: false });

    if (profilesError) {
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ users: [] }, { status: 200 });
    }

    // 替代方案：只返回 profiles 資料，email 需要手動填入或使用其他方式取得
    const usersWithProfiles = profiles.map((profile) => ({
      id: profile.id,
      email: '', // 需要執行 SQL 函數 migration 才能取得 email
      role: profile.role,
      created_at: profile.created_at,
    }));

    return NextResponse.json({ users: usersWithProfiles }, { status: 200 });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(['admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    const { id, role } = body;

    if (!id || !role) {
      return NextResponse.json(
        { error: 'ID and role are required' },
        { status: 400 }
      );
    }

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // 不能改自己的角色，避免管理員誤把自己降級而失去管理權限
    if (id === auth.session.id) {
      return NextResponse.json(
        { error: '不能修改自己的角色' },
        { status: 403 }
      );
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // DB trigger prevent_last_admin_removal 擋下
      if (error.message?.includes('cannot remove the last admin')) {
        return NextResponse.json(
          { error: '至少要保留一位管理員' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}
