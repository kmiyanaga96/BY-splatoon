// 表彰画像の「スクショ」テンプレート (1920x1080 PNG)。
// 任意のスクリーンショットを全面に敷き、上部の帯 (ロゴ・大会名・見出しの札) と下部のパネル (チーム名・メンバー) を重ねる。
// スクリーンショットはブラウザの中だけで使い、どこにも保存しない。

import { BODY, DISPLAY, ensureFonts, fit, hexToRgb, loadImage, starRow, type AwardData } from './award';

export const PHOTO_W = 1920;
export const PHOTO_H = 1080;

/** 上部の帯の色。目に優しいよう、蛍光色にならない落ち着いた色だけにする。team はチームカラー */
export type PhotoBand = 'team' | 'yellow' | 'mint' | 'lavender' | 'white' | 'black';

export const PHOTO_BANDS: { value: PhotoBand; label: string; color: string | null }[] = [
  { value: 'team', label: 'チーム色', color: null },
  { value: 'yellow', label: 'イエロー', color: '#e3d46a' },
  { value: 'mint', label: 'ミント', color: '#a9d6c0' },
  { value: 'lavender', label: 'ラベンダー', color: '#c4b8ec' },
  { value: 'white', label: 'ホワイト', color: '#f5f2ea' },
  { value: 'black', label: 'ブラック', color: '#1f1d26' },
];

export interface PhotoOptions {
  /** 読み込んだスクリーンショット。null なら案内を表示 */
  image: HTMLImageElement | null;
  /** 1 = 画面いっぱい (はみ出す分は切り取る)。大きいほど拡大 */
  zoom: number;
  /** はみ出した範囲の中での位置 (-1 = 左端/上端、0 = 中央、1 = 右端/下端) */
  x: number;
  y: number;
  top: boolean;
  bottom: boolean;
  band: PhotoBand;
}

export const DEFAULT_PHOTO: Omit<PhotoOptions, 'image'> = { zoom: 1, x: 0, y: 0, top: true, bottom: true, band: 'team' };

/** 画像を画面いっぱいに敷いたときの大きさと、はみ出した量 (ドラッグでの位置調整に使う) */
export function photoGeometry(img: { width: number; height: number }, zoom: number) {
  const scale = Math.max(PHOTO_W / img.width, PHOTO_H / img.height) * zoom;
  const w = img.width * scale;
  const h = img.height * scale;
  return { w, h, overflowX: w - PHOTO_W, overflowY: h - PHOTO_H };
}

/** 明るい色なら true (上に載せる文字を黒にする) */
function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

const TAG_COLOR = '#5a3fd6';

/** 見出しの札: 角を斜めに切り欠いた四角 (少し傾ける) */
function drawTag(ctx: CanvasRenderingContext2D, text: string, right: number, cy: number) {
  ctx.save();
  ctx.font = `400 54px ${DISPLAY}`;
  const w = Math.max(260, ctx.measureText(text).width + 120);
  const h = 92;
  ctx.translate(right - w / 2, cy);
  ctx.rotate(-0.035);
  const c = 18;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + c, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2 - c);
    ctx.lineTo(w / 2 - c, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h / 2 + c);
    ctx.closePath();
  };
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  path();
  ctx.fillStyle = TAG_COLOR;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // 内側の細い線
  ctx.save();
  ctx.scale((w - 22) / w, (h - 22) / h);
  path();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 4);
  ctx.restore();
}

/** スクショの表彰画像を描く。isCurrent が false を返したら描画しない */
export async function drawPhotoAward(canvas: HTMLCanvasElement, d: AwardData, p: PhotoOptions, isCurrent = () => true) {
  const text = [d.tournament, d.date, d.title, d.team.name, ...d.members.map((m) => m.name), '×0123456789スクリーンショットを選んでください'].join('');
  const [, logo, avatars] = await Promise.all([
    ensureFonts(text),
    loadImage(d.logo ?? ''),
    Promise.all(d.members.map((m) => loadImage(m.avatar))),
  ]);
  if (!isCurrent()) return;
  canvas.width = PHOTO_W;
  canvas.height = PHOTO_H;
  const ctx = canvas.getContext('2d')!;
  const W = PHOTO_W;
  const H = PHOTO_H;
  const teamColor = d.team.color || '#582eff';

  // スクリーンショット (画面いっぱい。はみ出す分は位置に合わせて切り取る)
  if (p.image) {
    const g = photoGeometry(p.image, p.zoom);
    const dx = -g.overflowX * ((p.x + 1) / 2);
    const dy = -g.overflowY * ((p.y + 1) / 2);
    ctx.drawImage(p.image, dx, dy, g.w, g.h);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#3a3550');
    grad.addColorStop(1, '#1f1c2b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = `700 44px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('スクリーンショットを選んでください', W / 2, H / 2);
  }

  // 上部の帯: ロゴ + 大会名 (+ 日付)、右に見出しの札
  if (p.top) {
    const bandColor = PHOTO_BANDS.find((b) => b.value === p.band)?.color ?? teamColor;
    const light = isLight(bandColor);
    const BH = 112;
    ctx.fillStyle = bandColor;
    ctx.fillRect(0, 0, W, BH);
    // うっすらと斜めのストライプ
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, BH);
    ctx.clip();
    ctx.globalAlpha = light ? 0.08 : 0.1;
    ctx.fillStyle = light ? '#000000' : '#ffffff';
    for (let x = -BH; x < W + BH; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, BH);
      ctx.lineTo(x + 14, BH);
      ctx.lineTo(x + 14 + BH, 0);
      ctx.lineTo(x + BH, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    let x = 40;
    if (logo) {
      ctx.drawImage(logo, x, 12, BH - 24, BH - 24);
      x += BH - 24 + 22;
    }
    const tagSpace = 440;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = light ? '#1c1a25' : '#ffffff';
    const nameMax = W - tagSpace - x - 40;
    const name = fit(ctx, d.tournament, (s) => `400 ${s}px ${DISPLAY}`, 60, 34, nameMax);
    ctx.fillText(name, x, BH / 2 + 3);
    if (d.date) {
      const nameW = ctx.measureText(name).width;
      ctx.font = `700 26px ${BODY}`;
      ctx.globalAlpha = 0.8;
      if (x + nameW + 28 + ctx.measureText(d.date).width < W - tagSpace) ctx.fillText(d.date, x + nameW + 28, BH / 2 + 6);
      ctx.globalAlpha = 1;
    }
    if (d.title) drawTag(ctx, d.title, W - 44, BH / 2 + 10);
  }

  // 下部のパネル: チーム名 + メンバー (アイコン・名前・戦績の星)
  if (p.bottom) {
    const A = 46; // アイコンの直径
    const gap = 40;
    const nameFont = `700 32px ${BODY}`;
    ctx.font = nameFont;
    const members = d.members.map((m, i) => {
      const nm = m.name || '(名前未入力)';
      const nameW = Math.min(300, ctx.measureText(nm).width);
      const stars = m.titles && m.titles.gold + m.titles.silver > 0 ? starRow(ctx, m.titles, 13, `700 22px ${BODY}`, '#ffffff') : null;
      ctx.font = nameFont;
      return { nm, nameW, stars, img: avatars[i], w: A + 12 + nameW + (stars ? 10 + stars.width : 0) };
    });
    const rowW = members.reduce((s, m) => s + m.w, 0) + Math.max(0, members.length - 1) * gap;
    ctx.font = `400 46px ${DISPLAY}`;
    const teamW = Math.min(W - 280, ctx.measureText(d.team.name).width);
    const PW = Math.min(W - 120, Math.max(rowW, teamW) + 96);
    const PH = members.length ? 170 : 104;
    const px = (W - PW) / 2;
    const py = H - PH - 36;
    ctx.fillStyle = 'rgba(18, 16, 26, 0.86)';
    ctx.beginPath();
    ctx.roundRect(px, py, PW, PH, 28);
    ctx.fill();
    // 上辺にチームカラーの細い線
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.roundRect(px + 28, py, PW - 56, 6, 3);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fit(ctx, d.team.name, (s) => `400 ${s}px ${DISPLAY}`, 46, 28, PW - 96), W / 2, py + 56);

    if (members.length) {
      // 横幅に収まらないときは全体を縮める
      const scale = Math.min(1, (PW - 96) / rowW);
      ctx.save();
      ctx.translate(W / 2, py + 122);
      ctx.scale(scale, scale);
      let x = -rowW / 2;
      for (const m of members) {
        const cx = x + A / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, 0, A / 2, 0, Math.PI * 2);
        ctx.fillStyle = teamColor;
        ctx.fill();
        ctx.clip();
        if (m.img) ctx.drawImage(m.img, cx - A / 2, -A / 2, A, A);
        else {
          ctx.fillStyle = '#ffffff';
          ctx.font = `400 24px ${DISPLAY}`;
          ctx.textAlign = 'center';
          ctx.fillText([...m.nm][0], cx, 2);
        }
        ctx.restore();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, 0, A / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fit(ctx, m.nm, (s) => `700 ${s}px ${BODY}`, 32, 20, m.nameW), x + A + 12, 2);
        if (m.stars) m.stars.draw(x + A + 12 + m.nameW + 10, 0);
        x += m.w + gap;
      }
      ctx.restore();
    }
  }
}
