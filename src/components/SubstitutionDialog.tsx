'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { runnerLabel } from '@/components/BaseDiamond';
import { Bases, RunnerPlayerRef } from '@/lib/baserunning';
import {
  Half,
  LineupEntry,
  ON_BASE_REPLACE_ERROR,
  SUB_TYPES,
  SubType,
  benchPlayers,
  defenseHalf,
  inningLabel,
  nextSlotNumber,
  offenseHalf,
  playerOnBase,
  slotOfPlayer,
} from '@/lib/substitution';

export interface SubstitutionRequest {
  sub_type: SubType;
  batting_order: number;
  out_player_id: string | null;
  in_player_id: string;
  inning: number;
  half: Half;
  base: number | null;
}

interface RosterPlayer {
  id: string;
  name: string;
  number: string | null;
}

interface SubstitutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType: SubType;
  lineup: LineupEntry[];
  bases: Bases;
  currentSlot: number;
  inning: number;
  homeAway: 'home' | 'away';
  players: RosterPlayer[];
  // 這場比賽曾經上場、已被換下的球員（選單上標示）
  formerIds: Set<string>;
  saving: boolean;
  error?: string;
  onConfirm: (req: SubstitutionRequest) => void;
}

const BASE_NAMES = ['', '一壘', '二壘', '三壘'];

function name(p: RunnerPlayerRef | null | undefined): string {
  return runnerLabel(p ? { player: p } : null);
}

function defaultHalf(type: SubType, homeAway: 'home' | 'away'): Half {
  // 代打、代跑、加棒次是我方進攻時；一般替換最常是上場守備前
  return type === 'replace' ? defenseHalf(homeAway) : offenseHalf(homeAway);
}

// 每次開啟用 key 重新掛載，初始值直接從 props 帶入
export function SubstitutionDialog({
  open,
  onOpenChange,
  initialType,
  lineup,
  bases,
  currentSlot,
  inning,
  homeAway,
  players,
  formerIds,
  saving,
  error,
  onConfirm,
}: SubstitutionDialogProps) {
  const occupied = ([1, 2, 3] as const).filter((b) => bases[b]);
  const [type, setType] = useState<SubType>(initialType);
  const [base, setBase] = useState<number | null>(occupied.length === 1 ? occupied[0] : null);
  const [replaceSlot, setReplaceSlot] = useState(currentSlot);
  const [inId, setInId] = useState('');
  const [subInning, setSubInning] = useState(inning);
  const [half, setHalf] = useState<Half>(defaultHalf(initialType, homeAway));

  const pickType = (t: SubType) => {
    setType(t);
    setHalf(defaultHalf(t, homeAway));
    // 代打、代跑一定是現在這一局
    if (t === 'pinch_hitter' || t === 'pinch_runner') setSubInning(inning);
  };

  // 這次換人的棒次與換下的球員
  const runner = type === 'pinch_runner' && base ? bases[base] : null;
  const slotNo =
    type === 'pinch_hitter'
      ? currentSlot
      : type === 'pinch_runner'
        ? slotOfPlayer(lineup, runner?.playerId ?? null)
        : type === 'replace'
          ? replaceSlot
          : nextSlotNumber(lineup);
  const outEntry = type === 'add_slot' ? null : lineup.find((l) => l.batting_order === slotNo) ?? null;
  const bench = benchPlayers(players, lineup);
  const inPlayer = bench.find((p) => p.id === inId) ?? null;
  const fixedTime = type === 'pinch_hitter' || type === 'pinch_runner';

  let problem: string | null = null;
  if (type === 'pinch_runner') {
    if (occupied.length === 0) problem = '壘上沒有跑者，不能代跑';
    // 409 重新載入後原本選的壘包可能已經沒人：請重新選壘包
    else if (!base || !runner) problem = '請選擇要代跑的壘包';
    else if (!slotNo) problem = '這位跑者不在目前的打序上，無法代跑';
  } else if (type === 'add_slot' && !slotNo) {
    problem = '已經到 20 棒上限';
  } else if (type !== 'add_slot' && !outEntry) {
    problem = '請選擇棒次';
  } else if (type === 'replace' && playerOnBase(bases, outEntry?.player_id ?? null)) {
    problem = ON_BASE_REPLACE_ERROR;
  }
  if (!problem && bench.length === 0) problem = '沒有可以換上場的球員（球員名單都已在打序上，或名單沒有載入）';

  const confirm = () => {
    if (problem || !inPlayer || !slotNo) return;
    onConfirm({
      sub_type: type,
      batting_order: slotNo,
      out_player_id: outEntry?.player_id ?? null,
      in_player_id: inPlayer.id,
      inning: subInning,
      half,
      base: type === 'pinch_runner' ? base : null,
    });
  };

  const typeLabel = SUB_TYPES.find((t) => t.type === type)?.label ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>換人</DialogTitle>
          <DialogDescription>已記錄的打席維持原球員；換人後這一棒由新球員接手</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SUB_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => pickType(t.type)}
              className={`h-11 rounded-lg border-2 px-1 text-sm whitespace-nowrap font-semibold ${
                type === t.type ? 'bg-primary border-primary text-primary-foreground' : 'bg-white border-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 換下誰 */}
        <div className="space-y-2">
          {type === 'pinch_hitter' && (
            <p className="text-sm">
              <span className="text-gray-500">換下目前打者 · 第 {currentSlot} 棒</span>{' '}
              <span className="font-semibold">{name(outEntry?.players)}</span>
            </p>
          )}
          {type === 'pinch_runner' && (
            <div className="space-y-1.5">
              <div className="text-sm text-gray-500">要代跑的跑者</div>
              {occupied.length === 0 ? null : (
                <div className="grid grid-cols-1 gap-1.5">
                  {occupied.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBase(b)}
                      className={`h-11 rounded-lg border-2 px-3 text-left text-sm font-semibold truncate ${
                        base === b ? 'bg-primary border-primary text-primary-foreground' : 'bg-white border-gray-200'
                      }`}
                    >
                      {BASE_NAMES[b]} · {runnerLabel(bases[b])}
                    </button>
                  ))}
                </div>
              )}
              {runner && slotNo && <p className="text-xs text-gray-500">代跑者接手第 {slotNo} 棒</p>}
            </div>
          )}
          {type === 'replace' && (
            <label className="block space-y-1.5">
              <span className="text-sm text-gray-500">換下哪一棒</span>
              <select
                className="h-11 w-full rounded-md border bg-white px-2 text-base"
                value={replaceSlot}
                onChange={(e) => setReplaceSlot(Number(e.target.value))}
              >
                {lineup.map((l) => (
                  <option key={l.batting_order} value={l.batting_order}>
                    第 {l.batting_order} 棒 · {name(l.players)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === 'add_slot' && slotNo && (
            <p className="text-sm">
              新增 <span className="font-semibold">第 {slotNo} 棒</span>
              <span className="block text-xs text-gray-500">排在第 {slotNo - 1} 棒之後，打完再輪回第 1 棒</span>
            </p>
          )}
        </div>

        {/* 換上誰 */}
        <label className="block space-y-1.5">
          <span className="text-sm text-gray-500">{type === 'add_slot' ? '加入的球員' : `換上場（${typeLabel}）`}</span>
          <select
            className="h-11 w-full rounded-md border bg-white px-2 text-base"
            value={inId}
            onChange={(e) => setInId(e.target.value)}
          >
            <option value="">選擇球員</option>
            {bench.map((p) => (
              <option key={p.id} value={p.id}>
                {name(p)}
                {formerIds.has(p.id) ? '（已退場）' : ''}
              </option>
            ))}
          </select>
        </label>

        {/* 局數 */}
        {fixedTime ? (
          <p className="text-xs text-gray-500">{inningLabel(subInning, half)}（我方進攻）</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon-sm" onClick={() => setSubInning(Math.max(1, subInning - 1))} aria-label="上一局">
                ◀
              </Button>
              <span className="w-12 text-center font-semibold">{subInning} 局</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => setSubInning(Math.min(30, subInning + 1))} aria-label="下一局">
                ▶
              </Button>
            </div>
            <div className="flex gap-1">
              {(['top', 'bottom'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHalf(h)}
                  className={`h-9 rounded-md border-2 px-3 text-sm font-semibold ${
                    half === h ? 'bg-primary border-primary text-primary-foreground' : 'bg-white border-gray-200'
                  }`}
                >
                  {h === 'top' ? '上' : '下'}
                  <span className="ml-1 text-[11px] font-normal opacity-80">
                    {h === offenseHalf(homeAway) ? '進攻' : '守備'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!problem && inPlayer && (
          <p className="rounded-md bg-gray-50 p-2 text-sm">
            {type === 'add_slot' ? (
              <>第 {slotNo} 棒：<span className="font-semibold">{name(inPlayer)}</span> 加入</>
            ) : (
              <>
                第 {slotNo} 棒：{name(outEntry?.players)} → <span className="font-semibold">{name(inPlayer)}</span>
              </>
            )}
          </p>
        )}
        {problem && <p className="text-sm text-amber-700">{problem}</p>}
        {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button className="h-11" onClick={confirm} disabled={!!problem || !inPlayer || saving}>
            {saving ? '儲存中...' : '確認換人'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
