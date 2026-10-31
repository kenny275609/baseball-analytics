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
import { ResultCode, getResultOption } from '@/lib/atbat';
import {
  Bases,
  RunnerEventType,
  RunnerMove,
  STANDALONE_EVENTS,
  autoRbi,
  movesOuts,
  validateMoves,
} from '@/lib/baserunning';

const FROM_LABEL = ['打者', '一壘跑者', '二壘跑者', '三壘跑者'];

function optionLabel(from: number, to: number | null): string {
  if (to === null) return '出局';
  if (to === 4) return '得分';
  if (to === from) return `留${to}壘`;
  return `上${to}壘`;
}

// 單一跑者去向：停在原壘 / 推進到幾壘 / 回本壘得分 / 出局
function MovePicker({ move, onChange }: { move: RunnerMove; onChange: (to: number | null) => void }) {
  const targets: (number | null)[] = [];
  for (let b = Math.max(1, move.from); b <= 4; b++) targets.push(b);
  targets.push(null);

  return (
    <div className="space-y-1.5">
      <div className="text-sm">
        <span className="text-gray-500">{FROM_LABEL[move.from]}</span>{' '}
        <span className="font-semibold">{runnerLabel(move)}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {targets.map((to) => {
          const active = move.to === to;
          const tone = to === null ? 'blue' : to === 4 ? 'red' : 'gray';
          return (
            <button
              key={String(to)}
              type="button"
              onClick={() => onChange(to)}
              className={`h-11 rounded-lg border-2 text-sm font-semibold transition-colors ${
                active
                  ? tone === 'blue'
                    ? 'bg-blue-800 border-blue-800 text-white'
                    : tone === 'red'
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-primary border-primary text-primary-foreground'
                  : 'bg-white border-gray-200'
              }`}
            >
              {optionLabel(move.from, to)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MoveList({ moves, onChange }: { moves: RunnerMove[]; onChange: (moves: RunnerMove[]) => void }) {
  // 由前導跑者往後問，最後才是打者
  const ordered = [...moves].sort((a, b) => b.from - a.from);
  return (
    <div className="space-y-4">
      {ordered.map((m) => (
        <MovePicker
          key={m.from}
          move={m}
          onChange={(to) => onChange(moves.map((x) => (x.from === m.from ? { ...x, to } : x)))}
        />
      ))}
    </div>
  );
}

function OutsSummary({ moves, outsBefore }: { moves: RunnerMove[]; outsBefore: number }) {
  const outs = movesOuts(moves);
  const runs = moves.filter((m) => m.to === 4).length;
  const total = outsBefore + outs;
  return (
    <p className="text-sm text-gray-600">
      這個 play：{outs} 出局、{runs} 分 · 本局將 {total} 出局
      {total > 3 && <span className="text-red-600">（超過 3 出局，請確認）</span>}
    </p>
  );
}

// ============================================
// 打席後：逐一詢問每位跑者去向 + 打點
// ============================================

interface AtbatRunnersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: ResultCode;
  initialMoves: RunnerMove[];
  outsBefore: number;
  saving: boolean;
  onConfirm: (moves: RunnerMove[], rbi: number) => void;
}

// 每次開啟用 key 重新掛載，初始值直接從 props 帶入
export function AtbatRunnersDialog({
  open,
  onOpenChange,
  code,
  initialMoves,
  outsBefore,
  saving,
  onConfirm,
}: AtbatRunnersDialogProps) {
  const [moves, setMoves] = useState(initialMoves);
  const [rbiOverride, setRbiOverride] = useState<number | null>(null);
  const rbi = rbiOverride ?? autoRbi(code, moves);
  const invalid = validateMoves(moves);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{getResultOption(code)?.label}：跑者去向</DialogTitle>
          <DialogDescription>已依結果預填，請逐一確認每位跑者</DialogDescription>
        </DialogHeader>

        <MoveList moves={moves} onChange={setMoves} />

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">打點</span>
          <Button type="button" variant="outline" size="icon-lg" onClick={() => setRbiOverride(Math.max(0, rbi - 1))} disabled={rbi <= 0}>
            −
          </Button>
          <span className="w-6 text-center text-lg font-bold tabular-nums">{rbi}</span>
          <Button type="button" variant="outline" size="icon-lg" onClick={() => setRbiOverride(Math.min(4, rbi + 1))} disabled={rbi >= 4}>
            +
          </Button>
          {rbiOverride !== null && (
            <button type="button" className="text-xs text-gray-500 underline" onClick={() => setRbiOverride(null)}>
              自動計算
            </button>
          )}
        </div>

        <OutsSummary moves={moves} outsBefore={outsBefore} />
        {invalid && <p className="text-sm text-red-600">{invalid}</p>}

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button className="h-11" onClick={() => onConfirm(moves, rbi)} disabled={!!invalid || saving}>
            {saving ? '儲存中...' : '確認記錄'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// 兩個打席之間：盜壘、暴投、捕逸、牽制…
// ============================================

function standaloneDefaults(type: RunnerEventType, bases: Bases): RunnerMove[] {
  // 暴投/捕逸/投手犯規通常所有跑者各推進一個壘，其他預設留在原壘
  const advanceAll = type === 'wild_pitch' || type === 'passed_ball' || type === 'balk';
  return ([3, 2, 1] as const)
    .filter((b) => bases[b])
    .map((b) => ({
      playerId: bases[b]!.playerId,
      player: bases[b]!.player,
      from: b,
      to: advanceAll ? b + 1 : b,
    }));
}

interface StandaloneRunnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bases: Bases;
  outsBefore: number;
  saving: boolean;
  onConfirm: (type: RunnerEventType, moves: RunnerMove[]) => void;
}

export function StandaloneRunnerDialog({
  open,
  onOpenChange,
  bases,
  outsBefore,
  saving,
  onConfirm,
}: StandaloneRunnerDialogProps) {
  const [type, setType] = useState<RunnerEventType>('steal');
  const [moves, setMoves] = useState(() => standaloneDefaults('steal', bases));
  const invalid = validateMoves(moves);
  const moved = moves.some((m) => m.to !== m.from);

  const pickType = (t: RunnerEventType) => {
    setType(t);
    setMoves(standaloneDefaults(t, bases));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>跑壘事件</DialogTitle>
          <DialogDescription>記錄打席之間的推進或出局</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          {STANDALONE_EVENTS.map((e) => (
            <button
              key={e.type}
              type="button"
              onClick={() => pickType(e.type)}
              className={`h-11 rounded-lg border-2 text-sm font-semibold ${
                type === e.type ? 'bg-primary border-primary text-primary-foreground' : 'bg-white border-gray-200'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        <MoveList moves={moves} onChange={setMoves} />

        <OutsSummary moves={moves} outsBefore={outsBefore} />
        {invalid && <p className="text-sm text-red-600">{invalid}</p>}

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button className="h-11" onClick={() => onConfirm(type, moves)} disabled={!!invalid || !moved || saving}>
            {saving ? '儲存中...' : moved ? '確認記錄' : '請選擇跑者去向'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
