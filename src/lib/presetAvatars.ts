// 選手アイコンのデフォルト画像。画像を用意しない人向けに、次の 2 種類から選べるようにする。
// - OFFICIAL_AVATARS: Nintendo Switch Online で配布された公式アイコン (public/avatars/w<週>-<番号>.jpg)。
//   選んだときに読み込んで、取り込んだ画像と同じ 192px の JPEG data URL にして保存する
// - PRESET_AVATARS: オリジナルの SVG。data URL (SVG のまま) で保存する。数百バイトなので Firestore の上限にも余裕がある
// どちらも画像そのものを保存し id は保存しないので、あとから並べ替え・削除しても設定済みの選手には影響しない。

export interface PresetAvatar {
  id: string;
  label: string;
  url: string;
}

/** 配布週ごとに 8 種。画像を足したら週の数を増やす */
const OFFICIAL_WEEKS = ['第1週', '第2週', '第3週', '最終週'];

export const OFFICIAL_AVATARS: PresetAvatar[] = OFFICIAL_WEEKS.flatMap((week, w) =>
  Array.from({ length: 8 }, (_, i) => ({
    id: `w${w + 1}-${i + 1}`,
    label: `${week} ${i + 1}`,
    url: `${import.meta.env.BASE_URL}avatars/w${w + 1}-${i + 1}.jpg`,
  })),
);

const N = 96; // viewBox の一辺

/** 中心 (cx, cy) から角度 i/n の位置にある点 */
function polar(cx: number, cy: number, r: number, i: number, n: number, offset = -Math.PI / 2): [number, number] {
  const a = offset + (i / n) * Math.PI * 2;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

const f = (v: number) => Math.round(v * 10) / 10;

/** インクのしぶき: 長さの違う出っ張りを曲線でつないだ形と、まわりの飛沫 */
function splat(fg: string): string {
  const outer = [40, 27, 36, 30, 41, 26, 34];
  const n = outer.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const [x0, y0] = polar(46, 50, 17, i, n);
    const [cx, cy] = polar(46, 50, outer[i], i + 0.5, n);
    const [x1, y1] = polar(46, 50, 17, i + 1, n);
    d += `${i === 0 ? `M${f(x0)} ${f(y0)}` : ''}Q${f(cx)} ${f(cy)} ${f(x1)} ${f(y1)}`;
  }
  return `<path d="${d}Z" fill="${fg}" stroke="${fg}" stroke-width="4" stroke-linejoin="round"/><circle cx="46" cy="50" r="19" fill="${fg}"/>
<circle cx="80" cy="34" r="5" fill="${fg}"/><circle cx="74" cy="78" r="3.5" fill="${fg}"/><circle cx="18" cy="70" r="4" fill="${fg}"/>
<ellipse cx="38" cy="42" rx="7" ry="4.5" fill="#fff" opacity=".45" transform="rotate(-30 38 42)"/>`;
}

function drop(fg: string): string {
  return `<path d="M48 12C48 12 22 44 22 61a26 26 0 0 0 52 0C74 44 48 12 48 12Z" fill="${fg}"/>
<ellipse cx="38" cy="58" rx="5" ry="9" fill="#fff" opacity=".5" transform="rotate(20 38 58)"/>`;
}

function wave(fg: string): string {
  return `<path d="M0 44Q12 34 24 44T48 44T72 44T96 44V96H0Z" fill="${fg}" opacity=".45"/>
<path d="M0 60Q12 50 24 60T48 60T72 60T96 60V96H0Z" fill="${fg}"/>`;
}

function star(fg: string): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const [x, y] = polar(48, 51, i % 2 ? 15 : 34, i, 10);
    pts.push(`${f(x)} ${f(y)}`);
  }
  return `<path d="M${pts.join('L')}Z" fill="${fg}" stroke="${fg}" stroke-width="6" stroke-linejoin="round"/>`;
}

function dots(fg: string): string {
  let s = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = 15 + c * 22 + (r % 2 ? 11 : 0);
      s += `<circle cx="${x}" cy="${15 + r * 22}" r="${r % 2 ? 6 : 8}" fill="${fg}"/>`;
    }
  }
  return s;
}

function stripes(fg: string): string {
  let s = '';
  for (let i = -2; i < 6; i++) s += `<rect x="${i * 24}" y="-20" width="12" height="140" fill="${fg}"/>`;
  return `<g transform="rotate(35 48 48)">${s}</g>`;
}

function crown(fg: string): string {
  return `<path d="M18 68 14 30l18 16 16-22 16 22 18-16-4 38Z" fill="${fg}" stroke="${fg}" stroke-width="5" stroke-linejoin="round"/>
<rect x="18" y="70" width="60" height="9" rx="3" fill="${fg}"/>
<circle cx="48" cy="54" r="5" fill="#fff" opacity=".7"/>`;
}

function bolt(fg: string): string {
  return `<path d="M56 10 24 54h20l-6 32 34-46H52Z" fill="${fg}" stroke="${fg}" stroke-width="4" stroke-linejoin="round"/>`;
}

function svgUrl(bg: string, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${N * 2}" height="${N * 2}"><rect width="${N}" height="${N}" fill="${bg}"/>${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n/g, ''))}`;
}

const DEFS: { id: string; label: string; bg: string; fg: string; draw: (fg: string) => string }[] = [
  { id: 'splat-orange', label: 'インク（オレンジ）', bg: '#ffe6cc', fg: '#ff7a1a', draw: splat },
  { id: 'splat-blue', label: 'インク（ブルー）', bg: '#dce3ff', fg: '#2f5bff', draw: splat },
  { id: 'drop', label: 'しずく', bg: '#ffd9ec', fg: '#f0308f', draw: drop },
  { id: 'wave', label: 'なみ', bg: '#d6f6f7', fg: '#00a9b0', draw: wave },
  { id: 'star', label: 'ほし', bg: '#fff3c2', fg: '#e8a800', draw: star },
  { id: 'dots', label: 'ドット', bg: '#e2f8d8', fg: '#3dbb35', draw: dots },
  { id: 'stripes', label: 'ストライプ', bg: '#ebe2ff', fg: '#8b5cf6', draw: stripes },
  { id: 'crown', label: 'かんむり', bg: '#3a2a10', fg: '#ffc53d', draw: crown },
  { id: 'bolt', label: 'いなずま', bg: '#1d2240', fg: '#c8ff2e', draw: bolt },
];

export const PRESET_AVATARS: PresetAvatar[] = DEFS.map((d) => ({ id: d.id, label: d.label, url: svgUrl(d.bg, d.draw(d.fg)) }));
