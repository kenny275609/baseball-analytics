'use client';

import { Bases, Runner } from '@/lib/baserunning';

export function runnerLabel(r: Pick<Runner, 'player'> | null): string {
  if (!r?.player) return '（未知）';
  return r.player.number ? `#${r.player.number} ${r.player.name}` : r.player.name;
}

interface BaseDiamondProps {
  bases: Bases;
  outs: number;
}

// 壘包鑽石：二壘在上、一壘在右、三壘在左，跑者名字標在壘包旁
export function BaseDiamond({ bases, outs }: BaseDiamondProps) {
  const base = (n: 1 | 2 | 3, pos: string, labelPos: string) => {
    const runner = bases[n];
    return (
      <>
        <div
          className={`absolute ${pos} w-8 h-8 rotate-45 border-2 rounded-sm ${
            runner ? 'bg-amber-400 border-amber-600' : 'bg-white border-gray-300'
          }`}
          aria-label={runner ? `${n} 壘：${runnerLabel(runner)}` : `${n} 壘無人`}
        />
        {runner && (
          <div className={`absolute ${labelPos} max-w-24 truncate text-xs font-semibold text-gray-800`}>
            {runnerLabel(runner)}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-52 h-36">
        {/* 壘線：連接四個壘包中心 */}
        <svg className="absolute inset-0" viewBox="0 0 208 144" aria-hidden="true">
          <polygon points="104,36 146,80 104,128 62,80" fill="none" stroke="#d1d5db" strokeWidth="2" strokeDasharray="4 3" />
        </svg>
        {base(2, 'left-[88px] top-[20px]', 'left-0 right-0 top-0 mx-auto text-center')}
        {base(3, 'left-[46px] top-[64px]', 'left-0 top-[104px] w-20 text-left')}
        {base(1, 'left-[130px] top-[64px]', 'right-0 top-[104px] w-20 text-right')}
        {/* 本壘 */}
        <div className="absolute left-[96px] top-[120px] w-4 h-4 rotate-45 bg-gray-200 border border-gray-300" />
      </div>
      <div className="flex items-center gap-1" aria-label={`${outs} 出局`}>
        <span className="text-sm text-gray-500 mr-1">出局</span>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full border-2 border-red-600 ${i < outs ? 'bg-red-600' : ''}`} />
        ))}
      </div>
    </div>
  );
}
