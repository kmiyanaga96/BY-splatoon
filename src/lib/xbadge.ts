// Xパワー到達バッジ。ゲーム内の X ランキングバッジ (炎の飾り + 盾 / 銅・銀・金) を
// モチーフにしたオリジナルデザインの SVG。中央のマークは独自の「X」にしている。
// 色味を変えるときは X_TIERS の各色を調整する。

export interface XTier {
  min: number;
  label: string;
  /** 飾りの影・縁取り */
  dark: string;
  /** 炎・飾りの地の色 */
  deep: string;
  /** 盾の地の色 */
  base: string;
  /** 盾の上半分・縁の明るい色 */
  light: string;
  /** ハイライト */
  shine: string;
}

// 色は参考にしたゲーム内バッジ (2500=銅 / 2700=銀 / 3000=金) から拾ったもの
export const X_TIERS: XTier[] = [
  { min: 3000, label: 'X3000', dark: '#4a0800', deep: '#a74808', base: '#e09a10', light: '#ffd23d', shine: '#ffff9e' },
  { min: 2700, label: 'X2700', dark: '#2c3f54', deep: '#718da3', base: '#93a9bb', light: '#d3dee8', shine: '#ffffff' },
  { min: 2500, label: 'X2500', dark: '#5f070a', deep: '#a32c11', base: '#c8662e', light: '#f0b278', shine: '#ffe9c7' },
];

export function xTier(xp: number | null | undefined): XTier | null {
  if (xp == null) return null;
  return X_TIERS.find((t) => xp >= t.min) ?? null;
}

// バッジ全体の外形 (炎・左右の巻き飾り・下の台座・盾)。縁取りと地の色の両方に使う
const SILHOUETTE = [
  // 左右の炎 (外側に巻く 2 本の舌)
  '<path d="M37 42C24 37 15 27 18 12c3 8 8 11 14 12-2-7 0-13 5-18 0 9 4 15 11 22z"/>',
  '<path d="M63 42c13-5 22-15 19-30-3 8-8 11-14 12 2-7 0-13-5-18 0 9-4 15-11 22z"/>',
  '<path d="M42 30c1-7 5-11 8-16 3 5 7 9 8 16z"/>',
  '<circle cx="22" cy="58" r="16"/>',
  '<circle cx="78" cy="58" r="16"/>',
  '<ellipse cx="50" cy="80" rx="25" ry="14"/>',
  '<circle cx="50" cy="52" r="26"/>',
].join('');

const SHIELD = 'M29 29h42v25c0 16-10 24-21 31-11-7-21-15-21-31z';
const SHIELD_INNER = 'M33.5 33.5h33V54c0 13-8 20-16.5 26-8.5-6-16.5-13-16.5-26z';
const X_MARK = '<path d="M38 44h7.5L62 67h-7.5z"/><path d="M54.5 44H62L45.5 67H38z"/>';

export function xBadgeSvg(t: XTier): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 108 108" width="108" height="108">
<g stroke="#323232" stroke-width="12" stroke-linejoin="round" fill="#323232">${SILHOUETTE}</g>
<g stroke="#ffffff" stroke-width="7" stroke-linejoin="round" fill="#ffffff">${SILHOUETTE}</g>
<g fill="${t.deep}">${SILHOUETTE}</g>
<g fill="${t.dark}"><circle cx="19" cy="61" r="8.5"/><circle cx="81" cy="61" r="8.5"/><ellipse cx="50" cy="86" rx="14" ry="6"/></g>
<g fill="${t.deep}"><circle cx="22.5" cy="58" r="5"/><circle cx="77.5" cy="58" r="5"/></g>
<g fill="${t.light}" opacity=".85"><path d="M36 13c0 7 3 12 9 16l-5 5c-5-5-6-13-4-21z"/><path d="M64 13c0 7-3 12-9 16l5 5c5-5 6-13 4-21z"/><path d="M22 20c2 7 7 11 13 14l-3 4c-6-4-10-10-10-18z"/><path d="M78 20c-2 7-7 11-13 14l3 4c6-4 10-10 10-18z"/></g>
<path d="${SHIELD}" fill="${t.light}" stroke="${t.dark}" stroke-width="2"/>
<path d="${SHIELD_INNER}" fill="${t.base}"/>
<path d="M33.5 33.5h33V52h-33z" fill="${t.light}" opacity=".75"/>
<rect x="36" y="36" width="12" height="3" rx="1.5" fill="${t.shine}"/>
<g stroke="${t.dark}" stroke-width="4" stroke-linejoin="round" fill="${t.dark}">${X_MARK}</g>
<g fill="${t.shine}">${X_MARK}</g>
</svg>`;
}

const urlCache = new Map<XTier, string>();

export function xBadgeUrl(tier: XTier): string {
  let url = urlCache.get(tier);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xBadgeSvg(tier))}`;
    urlCache.set(tier, url);
  }
  return url;
}
