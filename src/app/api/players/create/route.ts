import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    const { name, number } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // 檢查是否有重複的球員（名字+背號）
    const { data: existingPlayers, error: checkError } = await supabase
      .from('players')
      .select('id, name, number')
      .eq('name', name);

    if (checkError) {
      throw checkError;
    }

    // 檢查是否有重複
    const isDuplicate = existingPlayers?.some((p) => {
      // 如果 number 為空，檢查是否有其他 number 為空的同名球員
      if (!number || number.trim() === '') {
        return !p.number || p.number.trim() === '';
      }
      // 如果 number 不為空，檢查是否有相同的 name + number
      return p.number === number;
    });

    if (isDuplicate) {
      return NextResponse.json(
        { error: '此球員名字和背號的組合已存在' },
        { status: 400 }
      );
    }

    const { data: player, error } = await supabase
      .from('players')
      .insert({ name, number: number || null })
      .select()
      .single();

    if (error) {
      // 如果是唯一性約束錯誤
      if (error.code === '23505') {
        return NextResponse.json(
          { error: '此球員名字和背號的組合已存在' },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json({ player }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating player:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create player' },
      { status: 500 }
    );
  }
}
