'use client';

import type { ResultGroup } from '@/lib/atbat';

// 座標系統（0–100，與舊版 canvas 存下來的資料相容）：
// X 0=左 100=右；Y 0=上 100=下；本壘板在 (50, 90)。
export const HOME = { x: 50, y: 90 };
export const INFIELD_RADIUS = 35;
const FENCE_RADIUS = 70;
const BASE_DIST = 25;

export interface FieldPoint {
  x: number;
  y: number;
  group?: ResultGroup | null;
}

interface BaseballFieldProps {
  points?: FieldPoint[];
  onSelect?: (x: number, y: number) => void;
  className?: string;
}

const GROUP_COLOR: Record<ResultGroup, string> = {
  hit: '#dc2626',
  onbase: '#f59e0b',
  out: '#1e3a8a',
  other: '#6b7280',
};

function polar(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: HOME.x + Math.cos(rad) * r, y: HOME.y - Math.sin(rad) * r };
}

export function BaseballField({ points = [], onSelect, className }: BaseballFieldProps) {
  const fenceL = polar(135, FENCE_RADIUS);
  const fenceR = polar(45, FENCE_RADIUS);
  const dirtL = polar(135, INFIELD_RADIUS);
  const dirtR = polar(45, INFIELD_RADIUS);
  const first = polar(45, BASE_DIST);
  const second = polar(90, BASE_DIST * Math.SQRT2);
  const third = polar(135, BASE_DIST);
  const lineL = polar(135, 100);
  const lineR = polar(45, 100);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSelect) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onSelect(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  };

  return (
    <svg
      viewBox="0 0 100 100"
      className={`w-full aspect-square rounded-lg border select-none touch-manipulation ${
        onSelect ? 'cursor-crosshair' : ''
      } ${className ?? ''}`}
      onClick={handleClick}
      role={onSelect ? 'button' : 'img'}
      aria-label="棒球場"
    >
      <rect width="100" height="100" fill="#4d7c4d" />
      <path
        d={`M${HOME.x},${HOME.y} L${fenceL.x},${fenceL.y} A${FENCE_RADIUS},${FENCE_RADIUS} 0 0 1 ${fenceR.x},${fenceR.y} Z`}
        fill="#6fbf6f"
      />
      <path
        d={`M${HOME.x},${HOME.y} L${dirtL.x},${dirtL.y} A${INFIELD_RADIUS},${INFIELD_RADIUS} 0 0 1 ${dirtR.x},${dirtR.y} Z`}
        fill="#d2b48c"
      />
      <polygon
        points={`${HOME.x},${HOME.y} ${first.x},${first.y} ${second.x},${second.y} ${third.x},${third.y}`}
        fill="#6fbf6f"
        stroke="#fff"
        strokeWidth="0.5"
      />
      <line x1={HOME.x} y1={HOME.y} x2={lineL.x} y2={lineL.y} stroke="#fff" strokeWidth="0.5" />
      <line x1={HOME.x} y1={HOME.y} x2={lineR.x} y2={lineR.y} stroke="#fff" strokeWidth="0.5" />
      <circle cx={HOME.x} cy={HOME.y - BASE_DIST * 0.7} r="2" fill="#b08a5a" />
      {[first, second, third].map((b, i) => (
        <rect key={i} x={b.x - 1.2} y={b.y - 1.2} width="2.4" height="2.4" fill="#fff" transform={`rotate(45 ${b.x} ${b.y})`} />
      ))}
      <rect x={HOME.x - 1.2} y={HOME.y - 1.2} width="2.4" height="2.4" fill="#fff" />

      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={onSelect ? 2.2 : 1.6}
          fill={GROUP_COLOR[p.group ?? 'hit']}
          stroke="#fff"
          strokeWidth="0.5"
        />
      ))}
    </svg>
  );
}

// ============================================
// 落點分區：內野/外野 × 左/中/右
// ============================================

export type Zone = 'LF' | 'CF' | 'RF' | 'IL' | 'IC' | 'IR';

export const ZONE_LABELS: Record<Zone, string> = {
  LF: '左外野',
  CF: '中外野',
  RF: '右外野',
  IL: '內野左側',
  IC: '內野中間',
  IR: '內野右側',
};

export function zoneOf(x: number, y: number): Zone {
  const dx = x - HOME.x;
  const dy = HOME.y - y;
  const dist = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const side = angle >= 112.5 ? 'L' : angle >= 67.5 ? 'C' : 'R';
  if (dist >= INFIELD_RADIUS) return `${side}F` as Zone;
  return `I${side}` as Zone;
}
