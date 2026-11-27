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
  /** 破線 */
  dashed?: boolean;
  points: [number, number][];
}

/** 味方 / 敵 (アイコンの枠の色を決める) */
export type Team = 'ally' | 'enemy';
export const TEAMS: { value: Team; label: string; color: string }[] = [
  { value: 'ally', label: '味方', color: '#3f8cff' },
  { value: 'enemy', label: '敵', color: '#ff8a3d' },
];
export const teamColor = (t: Team) => TEAMS.find((x) => x.value === t)!.color;

export interface IconItem {
  type: 'icon';
  id: string;
  kind: IconKind;
  /** ブキ ID / サブ・スペシャルの ID */
  ref: string;
  /** 枠の色 (team があればそちらの色) */
  color: string;
  team?: Team;
  /** アイコンの下に出す名前・番号 */
  label?: string;
  x: number;
  y: number;
}

export interface TextItem {
  type: 'text';
  id: string;
  text: string;
  color: string;
  /** 文字の大きさ (長い辺が 1000px のときの px) */
  size: number;
  /** 文字の中心 */
  x: number;
  y: number;
}

export type BoardItem = StrokeItem | IconItem | TextItem;

/** 1 コマ (場面) */
export interface Slide {
  id: string;
  label: string;
  /** 画像の下に入れる 1〜2 行のメモ */
  memo: string;
  items: BoardItem[];
}

/**
 * 1 つの作戦 (ステージ × ルールごとに 1 つ、この端末に保存)。
 * 将来「公式戦術帳」として Firestore に保存するときも、この形をそのまま 1 ドキュメントにする想定
 */
export interface Plan {
  slides: Slide[];
}

export const DEFAULT_SLIDE_LABELS = ['初動', '抑え', '打開'];
export const MAX_SLIDES = 6;
export const MEMO_MAX = 80;
export const LABEL_MAX = 8;
export const TEXT_SIZES = [20, 28, 40];

export const planKey = (stage: string, rule: string) => `${stage}|${rule}`;
export const defaultPlan = (): Plan => ({
  slides: DEFAULT_SLIDE_LABELS.map((label, i) => ({ id: `s${i + 1}`, label, memo: '', items: [] })),
});

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
    if (it.type === 'text') {
      const b = textBox(it, w, h);
      if (px >= b.x0 - slop / 2 && px <= b.x1 + slop / 2 && py >= b.y0 - slop / 2 && py <= b.y1 + slop / 2) return it;
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
  if (item.type !== 'stroke') return { ...item, x: clamp(item.x + dx), y: clamp(item.y + dy) };
  return { ...item, points: item.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
}

/** 文字の大きさ (px) */
export const textPx = (it: TextItem, w: number, h: number) => (it.size * boardScale(w, h)) / 1000;

/** 文字の囲み (px)。全角は 1 文字、半角は 0.6 文字分の幅で見積もる */
export function textBox(it: TextItem, w: number, h: number) {
  const fs = textPx(it, w, h);
  const width = [...it.text].reduce((n, c) => n + (c.charCodeAt(0) > 0xff ? 1 : 0.6), 0) * fs;
  const cx = it.x * w;
  const cy = it.y * h;
  return { x0: cx - width / 2, x1: cx + width / 2, y0: cy - fs * 0.6, y1: cy + fs * 0.6 };
}

const isItem = (it: unknown): it is BoardItem => {
  if (!it || typeof it !== 'object') return false;
  const x = it as BoardItem;
  if (x.type === 'stroke') return Array.isArray(x.points);
  if (x.type === 'icon') return typeof x.ref === 'string';
  if (x.type === 'text') return typeof x.text === 'string';
  return false;
};

/** 1 つの作戦を読み込む (形が崩れたものは捨てる) */
export function parsePlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Plan).slides)) return null;
  const slides = (raw as Plan).slides
    .filter((s): s is Slide => !!s && typeof s === 'object' && typeof s.id === 'string')
    .slice(0, MAX_SLIDES)
    .map((s) => ({
      id: s.id,
      label: typeof s.label === 'string' ? s.label : '',
      memo: typeof s.memo === 'string' ? s.memo.slice(0, MEMO_MAX) : '',
      items: Array.isArray(s.items) ? s.items.filter(isItem) : [],
    }));
  return slides.length ? { slides } : null;
}

/** 保存データを読み込む */
export function parsePlans(raw: unknown): Record<string, Plan> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, Plan> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = parsePlan(v);
    if (p) out[key] = p;
  }
  return out;
}

/** 以前の保存形式 ("ステージ|ルール|場面" → 描いたもの) を作戦の形に直す */
export function migrateBoards(raw: unknown): Record<string, Plan> {
  if (!raw || typeof raw !== 'object') return {};
  const order = ['opening', 'hold', 'break'];
  const out: Record<string, Plan> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    const i = key.lastIndexOf('|');
    const idx = order.indexOf(key.slice(i + 1));
    if (i < 0 || idx < 0 || !Array.isArray(list)) continue;
    const pk = key.slice(0, i);
    out[pk] ??= defaultPlan();
    out[pk].slides[idx].items = list.filter(isItem);
  }
  return out;
}

/** 前のコマのブキの配置だけを写す (今のコマのブキは置き換え、線・文字・サブ・スペシャルは残す) */
export function copyTokens(from: BoardItem[], to: BoardItem[], newId: () => string): BoardItem[] {
  const isWeapon = (it: BoardItem) => it.type === 'icon' && it.kind === 'weapon';
  return [...to.filter((it) => !isWeapon(it)), ...from.filter(isWeapon).map((it) => ({ ...it, id: newId() }))];
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
  if (s.dashed) ctx.setLineDash([lw * 2.2, lw * 1.8]);
  path();
  ctx.strokeStyle = highlight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = lw + (highlight ? 8 : 3);
  ctx.stroke();
  if (s.dashed) ctx.setLineDash([lw * 2.2, lw * 1.8]);
  path();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.setLineDash([]);
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
  ctx.strokeStyle = it.team ? teamColor(it.team) : it.color;
  ctx.stroke();
  if (it.label) {
    const fs = Math.max(10, r * 0.72);
    ctx.save();
    ctx.font = `700 ${fs}px "Noto Sans JP", sans-serif`;
    const tw = ctx.measureText(it.label).width;
    const bw = tw + fs * 0.7;
    const bh = fs * 1.35;
    const by = cy + r * 0.82;
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, by, bw, bh, bh / 2);
    ctx.fillStyle = it.team ? teamColor(it.team) : it.color;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, cx, by + bh / 2 + fs * 0.04);
    ctx.restore();
  }
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

function drawText(ctx: CanvasRenderingContext2D, it: TextItem, w: number, h: number, highlight: boolean) {
  const fs = textPx(it, w, h);
  ctx.save();
  ctx.font = `700 ${fs}px "Noto Sans JP", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, fs * 0.22);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.strokeText(it.text, it.x * w, it.y * h);
  ctx.fillStyle = it.color;
  ctx.fillText(it.text, it.x * w, it.y * h);
  if (highlight) {
    const b = textBox(it, w, h);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(b.x0 - 4, b.y0 - 4, b.x1 - b.x0 + 8, b.y1 - b.y0 + 8);
  }
  ctx.restore();
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
    else if (it.type === 'text') drawText(ctx, it, w, h, it.id === selectedId);
    else drawIcon(ctx, it, w, h, icons.get(`${it.kind}:${it.ref}`), it.id === selectedId);
  }
}

// ---- 書き出し (1 コマ / 全コマを横に並べた 1 枚) ----

export interface SheetLayout {
  width: number;
  height: number;
  pad: number;
  titleH: number;
  labelH: number;
  boardW: number;
  boardH: number;
  memoH: number;
}

/** 書き出す画像の大きさと配置。title・ラベルはコマが 2 つ以上のときだけ入れる */
export function sheetLayout(slides: Slide[], boardW: number, aspect: number, title: boolean): SheetLayout {
  const multi = slides.length > 1;
  const pad = multi || slides.some((s) => s.memo.trim()) ? Math.round(boardW * 0.025) : 0;
  const boardH = Math.round(boardW / aspect);
  const titleH = multi && title ? Math.round(boardW * 0.07) : 0;
  const labelH = multi ? Math.round(boardW * 0.06) : 0;
  const memoH = slides.some((s) => s.memo.trim()) ? Math.round(boardW * 0.1) : 0;
  return {
    width: pad + slides.length * (boardW + pad),
    height: pad + titleH + labelH + boardH + memoH + pad,
    pad,
    titleH,
    labelH,
    boardW,
    boardH,
    memoH,
  };
}

/** 幅 maxW に収まるよう、文字単位で最大 lines 行に折り返す */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, lines: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const c of text.replace(/\s*\n\s*/g, ' ')) {
    if (ctx.measureText(cur + c).width > maxW && cur) {
      out.push(cur);
      cur = c;
      if (out.length === lines) break;
    } else cur += c;
  }
  if (out.length < lines && cur) out.push(cur);
  else if (out.length === lines && cur) out[lines - 1] = out[lines - 1].slice(0, -1) + '…';
  return out;
}

/** 書き出し用に、コマを横に並べて描く */
export function renderSheet(
  ctx: CanvasRenderingContext2D,
  L: SheetLayout,
  slides: Slide[],
  map: HTMLImageElement | null,
  icons: Map<string, HTMLImageElement>,
  title: string,
) {
  ctx.fillStyle = '#1b1a22';
  ctx.fillRect(0, 0, L.width, L.height);
  const font = (px: number) => `700 ${px}px "Noto Sans JP", sans-serif`;
  ctx.textBaseline = 'middle';
  if (L.titleH) {
    ctx.fillStyle = '#ffffff';
    ctx.font = font(L.titleH * 0.5);
    ctx.textAlign = 'left';
    ctx.fillText(title, L.pad, L.pad + L.titleH / 2);
  }
  slides.forEach((s, i) => {
    const x = L.pad + i * (L.boardW + L.pad);
    let y = L.pad + L.titleH;
    if (L.labelH) {
      ctx.fillStyle = '#ffffff';
      ctx.font = font(L.labelH * 0.55);
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${s.label}`, x, y + L.labelH / 2);
      y += L.labelH;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, L.boardW, L.boardH);
    ctx.clip();
    renderBoard(ctx, L.boardW, L.boardH, map, s.items, icons);
    ctx.restore();
    if (L.memoH && s.memo.trim()) {
      const fs = L.memoH * 0.3;
      ctx.font = font(fs);
      ctx.fillStyle = '#e8e6f0';
      ctx.textAlign = 'left';
      wrap(ctx, s.memo.trim(), L.boardW, 2).forEach((line, k) => ctx.fillText(line, x, y + L.boardH + fs * (1.05 + k * 1.35)));
    }
  });
}
