// 戦術データ (編成チェッカー用) の入力テンプレートの用意と、検証・変換。
//
//   npm run tactics:sync   … data/tactics/*.csv に足りない行 (新ブキなど) を足す。入力済みの値はそのまま残す
//   npm run tactics:check  … CSV を検証して、src/data/tactics.json を作る (ビルド前に実行する)
//
// CSV は UTF-8 (BOM 付き。Excel でそのまま開ける)。「（参考）」の列は自動で埋める列で、入力しなくてよい。
// 空欄は「未入力」として扱い、編成チェッカーではその項目を数えない (よく使うブキから順に埋めていける)。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'tactics');
const weapons = JSON.parse(readFileSync(join(root, 'src/data/weapons.json'), 'utf8')).weapons.filter((w) => !w.replica);
const subspe = JSON.parse(readFileSync(join(root, 'src/data/subspe.json'), 'utf8'));
const specials = subspe.filter((x) => x.kind === 'special');
const specialIdByName = new Map(specials.map((x) => [x.name, x.id]));

const CATEGORY_NAMES = {
  Shooter: 'シューター', Blaster: 'ブラスター', Roller: 'ローラー', Brush: 'フデ', Charger: 'チャージャー', Slosher: 'スロッシャー',
  Spinner: 'スピナー', Maneuver: 'マニューバー', Shelter: 'シェルター', Stringer: 'ストリンガー', Saber: 'ワイパー',
};

export const ROLES = ['前衛', '中衛', '後衛', 'サポート'];
export const SPECIAL_CATEGORIES = ['打開・起点', '抑え・遅延', 'エリア確保', '敵を動かす'];
export const TAGS = ['曲射', 'ボム持ち', '機動力高', '潜伏', 'ホコ割り強', '塗り広げ', '索敵', '防御', '長射程牽制'];
/** 1〜5 の評価の列 (CSV の列名 → JSON のキー) */
const SCORES = [
  ['塗り拡張', 'paintArea'],
  ['瞬間塗り', 'paintBurst'],
  ['キル', 'kill'],
  ['エリア関与', 'objArea'],
  ['ヤグラ関与', 'objTower'],
  ['ホコ関与', 'objRainmaker'],
  ['アサリ関与', 'objClam'],
];
const SCORE_COLS = SCORES.map(([c]) => c);

/** 表の定義。key は行を見分ける列、ref は自動で埋める列 */
const TABLES = {
  mains: {
    file: 'mains.csv',
    key: 'メインID',
    cols: ['メインID', 'メイン名（参考）', 'カテゴリ（参考）', 'ブキ（参考）', 'ポジション', '有効射程', ...SCORE_COLS],
    rows: () => {
      const byMain = new Map();
      for (const w of weapons) {
        if (!byMain.has(w.main)) byMain.set(w.main, []);
        byMain.get(w.main).push(w);
      }
      return [...byMain].map(([main, ws]) => ({
        メインID: main,
        'メイン名（参考）': ws[0].name,
        'カテゴリ（参考）': CATEGORY_NAMES[ws[0].category] ?? ws[0].category,
        'ブキ（参考）': ws.map((w) => w.name).join(' / '),
      }));
    },
  },
  kits: {
    file: 'kits.csv',
    key: 'ブキID',
    cols: ['ブキID', 'ブキ名（参考）', 'メインID（参考）', 'サブ（参考）', 'スペシャル（参考）', '打開力', 'タグ', '略称'],
    rows: () =>
      weapons.map((w) => ({
        ブキID: w.id,
        'ブキ名（参考）': w.name,
        'メインID（参考）': w.main,
        'サブ（参考）': w.sub,
        'スペシャル（参考）': w.special,
      })),
  },
  specials: {
    file: 'specials.csv',
    key: 'スペシャルID',
    cols: ['スペシャルID', 'スペシャル名（参考）', '分類'],
    rows: () => specials.map((x) => ({ スペシャルID: x.id, 'スペシャル名（参考）': x.name })),
  },
};

// ---- CSV ----

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return { head: head ?? [], rows: body.map((r) => Object.fromEntries((head ?? []).map((h, i) => [h.trim(), (r[i] ?? '').trim()]))) };
}

const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (cols, rows) => '﻿' + [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ''))].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

function read(t) {
  const path = join(dir, t.file);
  return existsSync(path) ? parseCsv(readFileSync(path, 'utf8')) : { head: [], rows: [] };
}

// ---- sync: 足りない行・列を足す ----

function sync() {
  mkdirSync(dir, { recursive: true });
  for (const [name, t] of Object.entries(TABLES)) {
    const old = new Map(read(t).rows.map((r) => [r[t.key], r]));
    const fresh = t.rows();
    const added = fresh.filter((r) => !old.has(r[t.key])).length;
    // 参考の列は最新のデータで上書きし、入力した列は残す
    const rows = fresh.map((r) => ({ ...(old.get(r[t.key]) ?? {}), ...r }));
    const gone = [...old.keys()].filter((k) => !fresh.some((r) => r[t.key] === k));
    writeFileSync(join(dir, t.file), toCsv(t.cols, rows));
    console.log(`${name}: ${rows.length} 行（新しく ${added} 行）${gone.length ? ` ※データにない行を削除: ${gone.join(', ')}` : ''}`);
  }
}

// ---- check: 検証して JSON にする ----

function check() {
  const errors = [];
  const out = { mains: {}, kits: {}, specials: {} };
  const filled = {};
  const num = (v, where, min, max, step) => {
    if (v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max || Math.abs(Math.round(n / step) * step - n) > 1e-9) {
      errors.push(`${where}: 「${v}」は ${min}〜${max}（${step} 刻み）で入力してください`);
      return undefined;
    }
    return n;
  };
  const oneOf = (v, where, list) => {
    if (v === '') return undefined;
    if (!list.includes(v)) {
      errors.push(`${where}: 「${v}」は ${list.join(' / ')} のどれかで入力してください`);
      return undefined;
    }
    return v;
  };

  for (const [name, t] of Object.entries(TABLES)) {
    const { head, rows } = read(t);
    if (!head.length) {
      errors.push(`${t.file} がありません（npm run tactics:sync で作成）`);
      continue;
    }
    const missingCols = t.cols.filter((c) => !head.map((h) => h.trim()).includes(c));
    if (missingCols.length) errors.push(`${t.file}: 列がありません: ${missingCols.join(', ')}`);
    const known = new Set(t.rows().map((r) => r[t.key]));
    for (const k of known) if (!rows.some((r) => r[t.key] === k)) errors.push(`${t.file}: ${k} の行がありません（npm run tactics:sync で追加）`);
    let done = 0;
    for (const r of rows) {
      const id = r[t.key];
      if (!known.has(id)) {
        errors.push(`${t.file}: ${id} はブキデータにありません`);
        continue;
      }
      const at = (c) => `${t.file} ${r[Object.keys(r)[1]] || id} の「${c}」`;
      if (name === 'mains') {
        const spec = {
          role: oneOf(r['ポジション'], at('ポジション'), ROLES),
          range: num(r['有効射程'], at('有効射程'), 0.1, 10, 0.1),
        };
        for (const [c, k] of SCORES) spec[k] = num(r[c], at(c), 1, 5, 1);
        const clean = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined));
        if (Object.keys(clean).length) out.mains[id] = clean;
        if (Object.keys(clean).length === 2 + SCORE_COLS.length) done++;
      } else if (name === 'kits') {
        const tags = r['タグ'] ? r['タグ'].split(/[\/／、,]/).map((x) => x.trim()).filter(Boolean) : [];
        for (const tag of tags) if (!TAGS.includes(tag)) errors.push(`${at('タグ')}: 「${tag}」は決めたタグにありません（${TAGS.join(' / ')}）`);
        const spec = {
          entry: num(r['打開力'], at('打開力'), 1, 5, 1),
          tags: tags.filter((x) => TAGS.includes(x)),
          short: r['略称'] || undefined,
        };
        if (spec.short && [...spec.short].length > 8) errors.push(`${at('略称')}: 8 文字までにしてください`);
        const clean = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)));
        if (Object.keys(clean).length) out.kits[id] = clean;
        if (spec.entry !== undefined) done++;
      } else {
        // 複数の分類を持てる (「/」区切り)
        const cats = r['分類'] ? r['分類'].split(/[\/／、,]/).map((x) => x.trim()).filter(Boolean) : [];
        const ok = cats.filter((c) => oneOf(c, at('分類'), SPECIAL_CATEGORIES));
        if (ok.length) {
          out.specials[id] = ok;
          done++;
        }
      }
    }
    filled[name] = `${done} / ${known.size}`;
  }
  // ブキ ID → スペシャル ID (スペシャルの分類を引くため)
  out.kitSpecial = Object.fromEntries(weapons.map((w) => [w.id, specialIdByName.get(w.special) ?? '']));

  console.log(`入力済み: メイン ${filled.mains ?? '-'} / ブキ（打開力）${filled.kits ?? '-'} / スペシャル ${filled.specials ?? '-'}`);
  if (errors.length) {
    console.error(`\n${errors.length} 件の問題があります:\n` + errors.map((e) => `- ${e}`).join('\n'));
    process.exit(1);
  }
  writeFileSync(join(root, 'src/data/tactics.json'), JSON.stringify(out, null, 1) + '\n');
  console.log('src/data/tactics.json を更新しました');
}

const mode = process.argv[2];
if (mode === 'sync') sync();
else if (mode === 'check') check();
else {
  console.error('使い方: node scripts/tactics.mjs sync | check');
  process.exit(1);
}
