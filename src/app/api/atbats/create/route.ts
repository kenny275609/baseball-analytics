import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { parseAtbatInput } from '@/lib/atbat';
import { isUuid, movedRunners, parseAllRunnerInputs, sacrificeFlyError } from '@/lib/baserunning';
import { checkRunnersInDb } from '@/lib/basesServer';
import { findExistingPlay, isUniqueViolation, parseClientId } from '@/lib/idempotency';
import { isMissingTable, syncGameScore } from '@/lib/score';

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    if (!isUuid(body.player_id) || !isUuid(body.game_id)) {
      return NextResponse.json({ error: '缺少球員或比賽' }, { status: 400 });
    }

    // 離線同步重送：同一個 client_id 已經寫過就直接回傳原本的打席，不重複記錄
    // （要在驗證壘上跑者之前查，第一次寫入後壘包已經變了）
    const clientId = parseClientId(body.client_id);
    if (clientId === false) {
      return NextResponse.json({ error: 'client_id 格式錯誤' }, { status: 400 });
    }
    if (clientId) {
      const existing = await findExistingPlay(supabase, body.game_id, clientId);
      if (existing.kind === 'atbat') {
        return NextResponse.json(
          { atbat: existing.atbat, runner_events: existing.events, duplicate: true },
          { status: 200 }
        );
      }
      if (existing.kind === 'play') {
        return NextResponse.json({ error: '這筆紀錄的識別碼已被其他跑壘事件使用' }, { status: 409 });
      }
    }

    const parsed = parseAtbatInput(body);
    if (!parsed.row) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const row = parsed.row;

    // 同一請求可一起送這個打席造成的跑壘（含打者本身 from_base 0）
    const allRunners = parseAllRunnerInputs(body.runners, true);
    if (!allRunners) {
      return NextResponse.json({ error: '跑壘資料錯誤' }, { status: 400 });
    }
    const runners = movedRunners(allRunners);
    // parseAtbatInput 已確認 body.result 是合法結果
    const sfError =
      allRunners.length > 0
        ? sacrificeFlyError(body.result, allRunners.map((r) => ({ from: r.from_base, to: r.to_base })))
        : null;
    if (sfError) {
      return NextResponse.json({ error: sfError }, { status: 400 });
    }
    if (runners.length > 0 && !row.inning) {
      return NextResponse.json({ error: '記錄跑壘需要局數' }, { status: 400 });
    }
    if (allRunners.length > 0 && row.inning) {
      // 跑者必須真的在壘上，且畫面上的壘上跑者要和資料庫一致（避免畫面過期或多裝置同時記錄造成錯亂）；
      // 資料表不存在時下面的 insert 會改成只記錄打席
      const check = await checkRunnersInDb(supabase, body.game_id, row.inning as number, allRunners);
      if (check.kind === 'invalid') {
        // 同一筆的另一個重送請求（例如逾時後重送）可能剛好在上面查詢之後寫入，壘包才會對不上
        if (clientId) {
          const existing = await findExistingPlay(supabase, body.game_id, clientId);
          if (existing.kind === 'atbat') {
            return NextResponse.json(
              { atbat: existing.atbat, runner_events: existing.events, duplicate: true },
              { status: 200 }
            );
          }
        }
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      if (check.kind === 'failed') throw check.error;
    }

    const { data: atbat, error } = await supabase
      .from('atbats')
      .insert({ ...row, player_id: body.player_id, game_id: body.game_id })
      // 帶上球員名字，前端可直接 append 到比賽打席列表不用整份重抓
      .select('*, players(name, number)')
      .single();

    if (error) {
      throw error;
    }

    let runnerEvents: unknown[] = [];
    let warning: string | undefined;
    if (runners.length > 0) {
      const playId = clientId ?? crypto.randomUUID();
      const { data, error: eventsError } = await supabase
        .from('runner_events')
        .insert(
          runners.map((r) => ({
            ...r,
            // 打者事件一律記在這個打席的打者身上
            runner_player_id: r.from_base === 0 ? body.player_id : r.runner_player_id,
            event_type: r.from_base === 0 ? 'batter' : 'runner',
            game_id: body.game_id,
            atbat_id: atbat.id,
            play_id: playId,
            inning: row.inning,
          }))
        )
        .select('*, players(name, number)');

      if (eventsError) {
        if (isMissingTable(eventsError)) {
          // migration 尚未執行：打席照存，只是沒有跑壘資料
          warning = '跑壘資料表尚未建立，這次只記錄打席';
        } else {
          // 沒有交易可用，手動把剛建立的打席撤回，避免打席和跑壘不一致；
          // unique index 擋下的重複（兩個重送請求同時到）撤回後回傳先寫入的那一筆
          const duplicate = clientId !== null && isUniqueViolation(eventsError);
          if (!duplicate) console.error('Error creating runner events:', eventsError);
          const { data: removed, error: rollbackError } = await supabase
            .from('atbats')
            .delete()
            .eq('id', atbat.id)
            .select('id');
          if (rollbackError || !removed?.length) {
            console.error('Error rolling back atbat:', atbat.id, rollbackError);
            await syncGameScore(supabase, body.game_id);
            return NextResponse.json(
              { error: '跑壘資料儲存失敗，且打席未能撤回；請重新整理後刪除這筆打席再重記' },
              { status: 500 }
            );
          }
          if (duplicate && clientId) {
            const existing = await findExistingPlay(supabase, body.game_id, clientId);
            if (existing.kind === 'atbat') {
              return NextResponse.json(
                { atbat: existing.atbat, runner_events: existing.events, duplicate: true },
                { status: 200 }
              );
            }
          }
          return NextResponse.json({ error: '跑壘資料儲存失敗，打席未記錄，請再試一次' }, { status: 500 });
        }
      } else {
        runnerEvents = data ?? [];
      }
    }

    await syncGameScore(supabase, body.game_id);

    return NextResponse.json({ atbat, runner_events: runnerEvents, warning }, { status: 201 });
  } catch (error) {
    console.error('Error creating atbat:', error);
    return NextResponse.json(
      { error: 'Failed to create atbat' },
      { status: 500 }
    );
  }
}
