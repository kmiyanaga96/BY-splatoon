// 作戦ボード (ツールモード) の描画とあたり判定。
// 線・矢印・アイコンは、ボードの幅・高さに対する割合 (0〜1) の座標で持つ (画面の大きさや書き出しの解像度に関係なく同じ位置に描ける)。

export type IconKind = 'weapon' | 'sub' | 'special';

export interface StrokeItem {
  type: 'stroke';
  id: string;
  color: string;
  /** 太さ (長い辺が 1000px のときの px) */
  width: number;
  /** 終点に矢じりを付ける */
  arrow: boolean;
  points: [number, number][];
}

export interface IconItem {
  type: 'icon';
  id: string;
  kind: IconKind;
  /** ブキ ID / サブ・スペシャルの ID */
  ref: string;
  /** 枠の色 */
  color: string;
  x: number;
  y: number;
}

export type BoardItem = StrokeItem | IconItem;

/** 作戦の場面 (それぞれ別のボードとして持つ) */
export const PHASES = [
  { value: 'opening', label: '初動', icon: 'flag' },
  { value: 'break', label: '打開', icon: 'bolt' },
  { value: 'hold', label: '抑え', icon: 'shield' },
] as const;
export type Phase = (typeof PHASES)[number]['value'];

export const BOARD_RULES = ['ナワバリ', 'エリア', 'ヤグラ', 'ホコ', 'アサリ'] as const;
export type BoardRule = (typeof BOARD_RULES)[number];

export const STROKE_WIDTHS = [
  { value: 3, label: '細' },
  { value: 6, label: '中' },
  { value: 10, label: '太' },
];

/** 線の色のプリセット (地図の上で見やすい色) */
export const STROKE_COLORS = ['#3fd3f0', '#ff9b3d', '#ff5c9a', '#b28cff', '#d4f04a', '#ffffff'];

/** アイコンの半径 (ボードの長い辺に対する割合) */
export const ICON_R = 0.026;

/** 1 枚のボードを保存するキー */
export const boardKey = (stage: string, rule: string, phase: Phase) => `${stage}|${rule}|${phase}`;

/** 地図画像がないときのボードの縦横比 */
export const DEFAULT_ASPECT = 16 / 9;

/** 大きさの基準 (ボードの長い辺。縦長のマップでもアイコン・線が小さくなりすぎない) */
export const boardScale = (w: number, h: number) => Math.max(w, h);

/** 大きさ w × h のボードでの線の太さ (px) */
export const strokePx = (width: number, w: number, h: number) => (width * boardScale(w, h)) / 1000;

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * (x, y) (割合の座標) にあるいちばん上のもの。w・h は今のボードの大きさ (px)、slop はあたりの余裕 (px)
 */
export function hitTest(items: BoardItem[], x: number, y: number, w: number, h: number, slop = 8): BoardItem | null {
  const px = x * w;
  const py = y * h;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type === 'icon') {
      if (Math.hypot(px - it.x * w, py - it.y * h) <= ICON_R * boardScale(w, h) + slop / 2) return it;
      continue;
    }
    const tol = strokePx(it.width, w, h) / 2 + slop;
    const pts = it.points;
    if (pts.length === 1 && Math.hypot(px - pts[0][0] * w, py - pts[0][1] * h) <= tol) return it;
    for (let k = 1; k < pts.length; k++) {
      if (distToSegment(px, py, pts[k - 1][0] * w, pts[k - 1][1] * h, pts[k][0] * w, pts[k][1] * h) <= tol) return it;
    }
  }
  return null;
}

/** item を (dx, dy) (割合) だけ動かしたもの */
export function moveItem(item: BoardItem, dx: number, dy: number): BoardItem {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  if (item.type === 'icon') return { ...item, x: clamp(item.x + dx), y: clamp(item.y + dy) };
  return { ...item, points: item.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
}

/** 保存データを読み込む (形が崩れたものは捨てる) */
export function parseBoards(raw: unknown): Record<string, BoardItem[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, BoardItem[]> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    out[key] = list.filter(
      (it): it is BoardItem =>
        !!it &&
        typeof it === 'object' &&
        (((it as BoardItem).type === 'stroke' && Array.isArray((it as StrokeItem).points)) ||
          ((it as BoardItem).type === 'icon' && typeof (it as IconItem).ref === 'string')),
    );
  }
  return out;
}

// ---- 描画 ----

function drawStroke(ctx: CanvasRenderingContext2D, s: StrokeItem, w: number, h: number, highlight: boolean) {
  const pts = s.points.map(([x, y]) => [x * w, y * h] as [number, number]);
  if (!pts.length) return;
  const lw = strokePx(s.width, w, h);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
    // 中点を結ぶ 2 次曲線でなめらかにする
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    if (pts.length > 1) ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  // 地図の上でも見えるよう、暗い縁取りを先に描く
  path();
  ctx.strokeStyle = highlight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = lw + (highlight ? 8 : 3);
  ctx.stroke();
  path();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = lw;
  ctx.stroke();
  if (s.arrow && pts.length > 1) {
    const end = pts[pts.length - 1];
    // 終点から少し戻った点との向きで矢じりを描く (手ぶれで向きが乱れないように)
    const back = Math.max(12, lw * 3);
    let from = pts[0];
    for (let i = pts.length - 2; i >= 0; i--) {
      if (Math.hypot(end[0] - pts[i][0], end[1] - pts[i][1]) >= back) {
        from = pts[i];
        break;
      }
    }
    const a = Math.atan2(end[1] - from[1], end[0] - from[0]);
    const len = Math.max(14, lw * 3.2);
    const head = () => {
      ctx.beginPath();
      ctx.moveTo(end[0] - len * Math.cos(a - 0.5), end[1] - len * Math.sin(a - 0.5));
      ctx.lineTo(end[0], end[1]);
      ctx.lineTo(end[0] - len * Math.cos(a + 0.5), end[1] - len * Math.sin(a + 0.5));
    };
    head();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = lw + 3;
    ctx.stroke();
    head();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  ctx.restore();
}

function drawIcon(ctx: CanvasRenderingContext2D, it: IconItem, w: number, h: number, img: HTMLImageElement | undefined, highlight: boolean) {
  const r = ICON_R * boardScale(w, h);
  const cx = it.x * w;
  const cy = it.y * h;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = r * 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1b1a22';
  ctx.fill();
  ctx.restore();
  if (img) {
    const s = r * (it.kind === 'weapon' ? 1.55 : 1.35);
    ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.strokeStyle = it.color;
  ctx.stroke();
  if (highlight) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + Math.max(4, r * 0.25), 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 地図がないときの下地 (方眼) */
function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#23222c';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  const step = boardScale(w, h) / 24;
  for (let x = step; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = step; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** ボードを描く。icons はアイコン画像 ("<kind>:<ref>" → 画像) */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  map: HTMLImageElement | null,
  items: BoardItem[],
  icons: Map<string, HTMLImageElement>,
  selectedId: string | null = null,
) {
  ctx.clearRect(0, 0, w, h);
  if (map) ctx.drawImage(map, 0, 0, w, h);
  else drawGrid(ctx, w, h);
  for (const it of items) {
    if (it.type === 'stroke') drawStroke(ctx, it, w, h, it.id === selectedId);
    else drawIcon(ctx, it, w, h, icons.get(`${it.kind}:${it.ref}`), it.id === selectedId);
  }
}
