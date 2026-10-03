// 表彰画像 (1600x900 PNG) をテンプレートに沿って Canvas に描く。
// 文字はページで読み込んでいる Web フォント (Dela Gothic One / Noto Sans JP) を使う。

import { xBadgeUrl, xTier } from './xbadge';

export type AwardTemplate = 'pop' | 'team' | 'simple';

export const AWARD_TEMPLATES: { value: AwardTemplate; label: string }[] = [
  { value: 'pop', label: 'ポップ' },
  { value: 'team', label: 'チーム色' },
  { value: 'simple', label: 'シンプル' },
];

export const AWARD_W = 1600;
export const AWARD_H = 900;

export interface AwardMember {
  name: string;
  avatar: string;
  xp: number | null;
  leader: boolean;
}

export interface AwardWeapon {
  name: string;
  color: string;
  count: number;
  /** ブキアイコンの URL */
  icon: string;
}

export interface AwardData {
  tournament: string;
  date: string;
  /** 大見出し (優勝 / 準優勝 / ベスト4 / 自由入力) */
  title: string;
  /** 見出しの色を決める順位 (1, 2, 4, ...)。未確定は null */
  rank: number | null;
  team: { name: string; color: string };
  members: AwardMember[];
  weaponCaption: string;
  weapons: AwardWeapon[];
  showXp: boolean;
}

const DISPLAY = '"Dela Gothic One", "Noto Sans JP", sans-serif';
const BODY = '"Noto Sans JP", sans-serif';
const INK = '#1c1a25';
const SUB = '#5b5868';

function rankColor(rank: number | null): string {
  if (rank === 1) return '#d18f00';
  if (rank === 2) return '#7a8496';
  if (rank === 4) return '#b0662a';
  return '#582eff';
}

// ---- 小さなユーティリティ ----

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** color を white 方向に t (0-1) だけ薄める */
function tint(color: string, t: number): string {
  const [r, g, b] = hexToRgb(color);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

function seeded(seedText: string) {
  let s = 0;
  for (const ch of seedText) s = (s * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 指定幅に収まる最大のフォントサイズを設定する。最小でも収まらなければ末尾を省略した文字列を返す */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, max: number, min: number, width: number): string {
  let size = max;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > width) {
    size -= 2;
    ctx.font = font(size);
  }
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > width) cut = cut.slice(0, -1);
  return cut + '…';
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function ensureFonts(text: string) {
  try {
    await Promise.all([
      document.fonts.load(`400 40px "Dela Gothic One"`, text),
      document.fonts.load(`700 40px "Noto Sans JP"`, text),
      document.fonts.load(`500 40px "Noto Sans JP"`, text),
    ]);
  } catch {
    /* フォントが読めなくても代替フォントで描く */
  }
}

/** インクが飛び散ったような形 */
function splat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, rand: () => number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10 + rand() * 0.5;
    const d = r * (0.75 + rand() * 0.3);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.18 + rand() * 0.2), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const d = r * (1.25 + rand() * 0.45);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.04 + rand() * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- 本体 ----

/** isCurrent が false を返したら描画しない (プレビューの描き直しが重なったとき用) */
export async function drawAward(canvas: HTMLCanvasElement, d: AwardData, template: AwardTemplate, isCurrent = () => true) {
  const allText = [d.tournament, d.date, d.title, d.team.name, d.weaponCaption, ...d.members.map((m) => m.name), ...d.weapons.map((w) => w.name), 'BYスプラ大会ツールリーダーXP0123456789×+…'].join('');
  const [, avatars, badges] = await Promise.all([
    ensureFonts(allText),
    Promise.all(d.members.map((m) => loadImage(m.avatar))),
    Promise.all(d.members.map((m) => {
      const tier = d.showXp ? xTier(m.xp) : null;
      return tier ? loadImage(xBadgeUrl(tier)) : Promise.resolve(null);
    })),
  ]);
  const weaponIcons = await Promise.all(d.weapons.map((w) => loadImage(w.icon)));

  if (!isCurrent()) return;
  canvas.width = AWARD_W;
  canvas.height = AWARD_H;
  const ctx = canvas.getContext('2d')!;
  const W = AWARD_W;
  const H = AWARD_H;
  const color = d.team.color || '#582eff';
  const rand = seeded(d.team.name + d.title);
  let x0 = 96;
  let right = W - 96;

  // 背景
  if (template === 'pop') {
    ctx.fillStyle = '#fcf8ff';
    ctx.fillRect(0, 0, W, H);
    splat(ctx, 1460, 110, 230, color, rand);
    ctx.globalAlpha = 0.75;
    splat(ctx, 1530, 880, 150, tint(color, 0.35), rand);
    ctx.globalAlpha = 0.45;
    splat(ctx, 20, 470, 70, color, rand);
    ctx.globalAlpha = 1;
    right = W - 330;
  } else if (template === 'team') {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(40, 40, W - 80, H - 80, 40);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 28, H);
    ctx.strokeStyle = '#c9c4d6';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 大会名・日付
  ctx.fillStyle = SUB;
  ctx.fillText(fit(ctx, d.tournament, (s) => `700 ${s}px ${BODY}`, 36, 22, right - x0), x0, 120);
  if (d.date) {
    ctx.font = `500 26px ${BODY}`;
    ctx.fillText(d.date, x0, 162);
  }

  // 見出し (優勝など)
  ctx.fillStyle = rankColor(d.rank);
  ctx.fillText(fit(ctx, d.title, (s) => `400 ${s}px ${DISPLAY}`, 150, 60, right - x0), x0, 320);

  // チーム名 + 下線
  ctx.fillStyle = INK;
  const teamText = fit(ctx, d.team.name, (s) => `400 ${s}px ${DISPLAY}`, 84, 40, right - x0);
  ctx.fillText(teamText, x0, 432);
  ctx.fillStyle = color;
  ctx.fillRect(x0, 452, Math.min(ctx.measureText(teamText).width, right - x0), 12);

  // メンバー
  const n = Math.max(1, d.members.length);
  const colW = Math.min(300, (W - x0 * 2) / n);
  const D = Math.min(150, colW - 50);
  const top = 488;
  d.members.forEach((m, i) => {
    const cx = x0 + colW * i + colW / 2;
    const cy = top + D / 2;
    // アイコン
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, D / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = tint(color, 0.6);
    ctx.fill();
    ctx.clip();
    const img = avatars[i];
    if (img) {
      ctx.drawImage(img, cx - D / 2, cy - D / 2, D, D);
    } else {
      ctx.fillStyle = INK;
      ctx.font = `400 ${Math.round(D * 0.45)}px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText([...(m.name || '?')][0], cx, cy + D * 0.03);
    }
    ctx.restore();
    ctx.lineWidth = 8;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, D / 2, 0, Math.PI * 2);
    ctx.stroke();

    // Xバッジ (右上)
    const badge = badges[i];
    if (badge) ctx.drawImage(badge, cx + D * 0.22, cy - D / 2 - 10, 54, 61);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // リーダー
    if (m.leader) {
      ctx.font = `700 18px ${BODY}`;
      const w = ctx.measureText('リーダー').width + 24;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, cy + D / 2 - 16, w, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText('リーダー', cx, cy + D / 2 + 6);
    }
    // 名前・XP
    ctx.fillStyle = INK;
    ctx.fillText(fit(ctx, m.name || '(名前未入力)', (s) => `700 ${s}px ${BODY}`, 32, 18, colW - 16), cx, top + D + 56);
    if (d.showXp && m.xp) {
      const tier = xTier(m.xp);
      ctx.font = `700 22px ${BODY}`;
      ctx.fillStyle = tier ? tier.dark : SUB;
      ctx.fillText(`XP ${m.xp}`, cx, top + D + 90);
    }
  });

  // 使用ブキ (アイコン + 名前)。ブキがなければ欄ごと描かない
  if (d.weapons.length) drawWeapons();
  function drawWeapons() {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const IS = 72; // アイコンの直径
    const iy = 758;
    ctx.font = `700 24px ${BODY}`;
    ctx.fillStyle = SUB;
    ctx.fillText(d.weaponCaption, x0, iy + IS / 2);
    const slot = 150;
    let x = x0 + ctx.measureText(d.weaponCaption).width + 32;
    const limit = template === 'pop' ? W - 250 : W - x0;
    const maxSlots = Math.max(1, Math.floor((limit - x) / slot));
    const shown = d.weapons.length > maxSlots ? d.weapons.slice(0, maxSlots - 1) : d.weapons;
    shown.forEach((w, i) => {
      const cx = x + slot / 2;
      const cy = iy + IS / 2;
      ctx.fillStyle = tint(w.color, 0.7);
      ctx.beginPath();
      ctx.arc(cx, cy, IS / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = w.color;
      ctx.stroke();
      const icon = weaponIcons[i];
      if (icon) ctx.drawImage(icon, cx - IS * 0.42, cy - IS * 0.42, IS * 0.84, IS * 0.84);
      if (w.count > 1) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(cx + IS * 0.38, cy - IS * 0.36, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 18px ${BODY}`;
        ctx.textAlign = 'center';
        ctx.fillText(`×${w.count}`, cx + IS * 0.38, cy - IS * 0.36 + 1);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK;
      ctx.fillText(fit(ctx, w.name, (s) => `700 ${s}px ${BODY}`, 18, 12, slot - 8), cx, iy + IS + 22);
      ctx.textBaseline = 'middle';
      x += slot;
    });
    if (shown.length < d.weapons.length) {
      ctx.textAlign = 'left';
      ctx.font = `700 26px ${BODY}`;
      ctx.fillStyle = SUB;
      ctx.fillText(`+${d.weapons.length - shown.length}`, x + 16, iy + IS / 2);
    }
  }

  // フッター (右上に白い札で表示。どの背景でも読めるように)
  ctx.font = `500 18px ${BODY}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const label = 'BY スプラ大会ツール';
  const fw = ctx.measureText(label).width + 28;
  const fx = W - (template === 'team' ? 72 : 40);
  const fy = template === 'team' ? 76 : 44;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.roundRect(fx - fw, fy - 17, fw, 34, 17);
  ctx.fill();
  ctx.fillStyle = SUB;
  ctx.fillText(label, fx - 14, fy + 1);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の作成に失敗しました'))), 'image/png'),
  );
}
