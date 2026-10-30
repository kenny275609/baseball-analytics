# 產生 PWA 圖示：python3 scripts/generate-icons.py public （需要 Pillow）
import math
import sys
from PIL import Image, ImageDraw

BLUE = (59, 130, 246, 255)   # 與 theme_color #3b82f6 相同
WHITE = (255, 255, 255, 255)
RED = (220, 38, 38, 255)
OUTLINE = (203, 213, 225, 255)
SS = 4  # 先放大畫再縮小，邊緣比較平滑


def draw_ball(d, cx, cy, r):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE, outline=OUTLINE, width=max(1, int(r * 0.03)))
    # 兩條縫線：圓心在球外側的大圓弧
    sr = r * 0.95
    off = r * 1.25
    lw = max(2, int(r * 0.045))
    for side in (-1, 1):
        ox = cx + side * off
        base = math.pi if side > 0 else 0.0
        pts = []
        for i in range(-90, 91):
            a = base + math.radians(i)
            x, y = ox + sr * math.cos(a), cy + sr * math.sin(a)
            if (x - cx) ** 2 + (y - cy) ** 2 <= (r * 0.93) ** 2:
                pts.append((a, x, y))
        d.line([(x, y) for _, x, y in pts], fill=RED, width=lw, joint='curve')
        # 縫線上的短斜線
        step = max(1, len(pts) // 9)
        for k in range(step // 2 + 1, len(pts) - 1, step):
            a, x, y = pts[k]
            nx, ny = math.cos(a), math.sin(a)
            tx, ty = -ny, nx
            L = r * 0.09
            d.line([(x - nx * L + tx * L * 0.5, y - ny * L + ty * L * 0.5),
                    (x + nx * L - tx * L * 0.5, y + ny * L - ty * L * 0.5)], fill=RED, width=lw)


def make(size, ball_ratio, rounded=False):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BLUE)
    else:
        d.rectangle([0, 0, S, S], fill=BLUE)
    draw_ball(d, S / 2, S / 2, S * ball_ratio / 2)
    return img.resize((size, size), Image.LANCZOS)


out = sys.argv[1] if len(sys.argv) > 1 else 'public'
# any：圓角藍底，球佔 72%
make(192, 0.72, rounded=True).save(f'{out}/icon-192.png')
make(512, 0.72, rounded=True).save(f'{out}/icon-512.png')
# maskable：滿版藍底，球直徑 60%，完整落在中央 80% 安全區內
make(192, 0.60).save(f'{out}/icon-maskable-192.png')
make(512, 0.60).save(f'{out}/icon-maskable-512.png')
# apple-touch-icon：iOS 會自己裁圓角，透明處會變黑，所以用滿版不透明底
make(180, 0.70).convert('RGB').save(f'{out}/apple-touch-icon.png')
