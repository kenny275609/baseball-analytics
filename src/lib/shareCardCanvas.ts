// 把 ShareCardData 畫到 canvas（不依賴任何套件；瀏覽器 canvas 或 node-canvas 都能用）
import { OUTCOME_LABEL, ShareCardData } from '@/lib/shareCard';

export const CARD_WIDTH = 1080;
const PAD = 56;
const ROW_H = 66;
const FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif';

export function shareCardHeight(d: ShareCardData): number {
  return 300 + 250 + (d.mvp ? 190 : 0) + 90 + d.batters.length * ROW_H + 120;
}

type Ctx = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'font' | 'textAlign' | 'textBaseline' | 'fillRect' | 'fillText' | 'measureText' | 'beginPath' | 'roundRect' | 'fill' | 'strokeStyle' | 'lineWidth' | 'stroke' | 'moveTo' | 'lineTo'
>;

function fit(ctx: Ctx, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function box(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export function drawShareCard(ctx: Ctx, d: ShareCardData) {
  const W = CARD_WIDTH;
  const H = shareCardHeight(d);
  ctx.fillStyle = '#0f2747';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // 標題
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fb7d9';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText('⚾ 賽後戰報', PAD, 80);
  ctx.fillText(d.subtitle, PAD + 240, 80);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(fit(ctx, d.title, W - PAD * 2 - 170), PAD, 170);
  if (d.outcome) {
    const c = d.outcome === 'W' ? '#e03131' : d.outcome === 'L' ? '#495057' : '#f08c00';
    box(ctx, W - PAD - 140, 110, 140, 120, 24, c);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `900 76px ${FONT}`;
    ctx.fillText(OUTCOME_LABEL[d.outcome], W - PAD - 70, 172);
  }

  // 記分板
  let y = 270;
  box(ctx, PAD, y, W - PAD * 2, 220, 24, '#ffffff');
  const nameW = 220;
  const totW = 110;
  const cellW = (W - PAD * 2 - 32 - nameW - totW) / d.innings.length;
  const x0 = PAD + 16;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillStyle = '#868e96';
  ctx.textAlign = 'center';
  d.innings.forEach((i, k) => ctx.fillText(String(i), x0 + nameW + cellW * (k + 0.5), y + 40));
  ctx.fillText('R', x0 + nameW + cellW * d.innings.length + totW / 2, y + 40);
  const line = (label: string, runs: (number | null)[], total: number | null, ry: number) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#212529';
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(fit(ctx, label, nameW - 16), x0, ry);
    ctx.textAlign = 'center';
    ctx.font = `600 36px ${FONT}`;
    runs.forEach((r, k) => ctx.fillText(r === null ? '—' : String(r), x0 + nameW + cellW * (k + 0.5), ry));
    ctx.font = `900 44px ${FONT}`;
    ctx.fillStyle = '#0f2747';
    ctx.fillText(total === null ? '—' : String(total), x0 + nameW + cellW * d.innings.length + totW / 2, ry);
  };
  line(d.topLabel, d.topRuns, d.topTotal, y + 105);
  ctx.strokeStyle = '#e9ecef';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y + 140);
  ctx.lineTo(W - PAD - 16, y + 140);
  ctx.stroke();
  line(d.bottomLabel, d.bottomRuns, d.bottomTotal, y + 180);
  y += 250;

  // MVP
  if (d.mvp) {
    box(ctx, PAD, y, W - PAD * 2, 160, 24, '#ffd43b');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5c3c00';
    ctx.font = `800 32px ${FONT}`;
    ctx.fillText('🏆 本場 MVP', PAD + 32, y + 46);
    ctx.fillStyle = '#212529';
    ctx.font = `900 54px ${FONT}`;
    ctx.fillText(fit(ctx, d.mvp.name, 300), PAD + 32, y + 110);
    ctx.font = `600 32px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.font = `600 ${d.mvp.reason.length > 22 ? 28 : 32}px ${FONT}`;
    ctx.fillText(fit(ctx, d.mvp.reason, W - PAD * 2 - 64 - 320), W - PAD - 32, y + 110);
    y += 190;
  }

  // 各棒成績
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fb7d9';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('各棒成績', PAD, y + 30);
  ctx.textAlign = 'right';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(d.teamLine, W - PAD, y + 30);
  y += 70;
  d.batters.forEach((b, k) => {
    const ry = y + k * ROW_H;
    if (k % 2 === 0) box(ctx, PAD, ry, W - PAD * 2, ROW_H - 6, 14, 'rgba(255,255,255,0.07)');
    const cy = ry + (ROW_H - 6) / 2;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fb7d9';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(b.slot === null ? '' : String(b.slot), PAD + 44, cy);
    ctx.textAlign = 'left';
    ctx.fillStyle = b.current ? '#ffffff' : '#adb5bd';
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(fit(ctx, b.name, 200), PAD + 64, cy);
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = '#ffd43b';
    ctx.fillText(`${b.ab}打${b.h}安`, PAD + 270, cy);
    ctx.fillStyle = '#dee2e6';
    const extra = [b.rbi ? `${b.rbi}打點` : '', b.r ? `${b.r}得分` : ''].filter(Boolean).join(' ');
    ctx.fillText(extra, PAD + 400, cy);
    ctx.textAlign = 'right';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillStyle = '#ced4da';
    ctx.fillText(fit(ctx, b.results.join(' '), 300), W - PAD - 20, cy);
  });
  y += d.batters.length * ROW_H + 40;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#5c7cab';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText('壘球打擊紀錄 · 自動產生', W / 2, y + 30);
}
