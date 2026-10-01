// Xパワー到達バッジ。ゲーム内の X バッジを参考にしたオリジナルデザインの SVG。
// 色味を変えるときは X_TIERS の 3 色 (base: 地の色 / light: 右半分の面 / dark: 縁取り) を調整する。

export interface XTier {
  min: number;
  label: string;
  base: string;
  light: string;
  dark: string;
  /** 上部の飾り (ひし形) の数 */
  pips: number;
}

export const X_TIERS: XTier[] = [
  { min: 3000, label: 'X3000', base: '#e0a100', light: '#ffd34d', dark: '#6e4700', pips: 3 },
  { min: 2700, label: 'X2700', base: '#7b5cff', light: '#b3a3ff', dark: '#33189c', pips: 2 },
  { min: 2500, label: 'X2500', base: '#14b885', light: '#62e3b5', dark: '#08573e', pips: 1 },
];

export function xTier(xp: number | null | undefined): XTier | null {
  if (xp == null) return null;
  return X_TIERS.find((t) => xp >= t.min) ?? null;
}

// X の 2 本の斜線。縁取り用に太線で描いてから白で塗り重ねる
const X_PATHS = '<path d="M18 22h9.5l18.5 31h-9.5z"/><path d="M36.5 22H46L27.5 53H18z"/>';

const PIP_X: Record<number, number[]> = { 1: [32], 2: [27, 37], 3: [23, 32, 41] };

export function xBadgeSvg(tier: XTier): string {
  const pips = (PIP_X[tier.pips] ?? [])
    .map((x) => `<path d="M${x} 9.5l3 3.5-3 3.5-3-3.5z" fill="#fff"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72" width="64" height="72">
<path d="M32 1.5 62 18.5v35L32 70.5 2 53.5v-35z" fill="${tier.dark}"/>
<path d="M32 6.5 57 21v30L32 65.5 7 51V21z" fill="${tier.base}"/>
<path d="M32 6.5 57 21v30L32 65.5z" fill="${tier.light}" opacity=".55"/>
${pips}
<g stroke="${tier.dark}" stroke-width="5" stroke-linejoin="round" fill="${tier.dark}">${X_PATHS}</g>
<g fill="#fff">${X_PATHS}</g>
</svg>`;
}

export function xBadgeUrl(tier: XTier): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xBadgeSvg(tier))}`;
}
