// 編成チェッカー: 味方 4 人のブキとルールから、編成のバランスと勝ち筋 (ルールベース) を出す。
// しきい値は THRESHOLDS にまとめてあり、実際の編成で試しながら調整する前提の仮の値。
import { getWeapon } from '../data/weapons';
import { shortName, weaponTactics, type Score, type WeaponTactics } from './tactics';

export const CHECKER_RULES = ['エリア', 'ヤグラ', 'ホコ', 'アサリ'] as const;
export type CheckerRule = (typeof CHECKER_RULES)[number];

/** ルールごとのオブジェクト関与の項目と、担当の呼び名 */
const OBJECT: Record<CheckerRule, { key: 'objArea' | 'objTower' | 'objRainmaker' | 'objClam'; label: string; duty: string }> = {
  エリア: { key: 'objArea', label: 'エリア関与', duty: 'エリア維持' },
  ヤグラ: { key: 'objTower', label: 'ヤグラ関与', duty: 'ヤグラ乗り' },
  ホコ: { key: 'objRainmaker', label: 'ホコ関与', duty: 'ホコ持ち' },
  アサリ: { key: 'objClam', label: 'アサリ関与', duty: 'アサリ運び' },
};

/** 判定のしきい値 (評価は 4 人の平均。1〜5) */
export const THRESHOLDS = {
  /** 最長射程がこれ未満なら射程不足 */
  shortRange: 3.5,
  /** 最長射程がこれ以上なら長射程の軸がいる */
  longRange: 5,
  /** 塗り拡張の平均がこれ以下なら塗り不足 (エリアは厳しめ) */
  lowPaint: 2.5,
  lowPaintArea: 2.75,
  highPaint: 3.75,
  /** 瞬間塗りの平均がこれ以下なら足場取りが弱い */
  lowBurst: 2.5,
  /** キルの平均 */
  lowKill: 2.75,
  highKill: 4.25,
  /** 打開力の平均がこれ以下なら打開力不足 */
  lowEntry: 2.5,
  highEntry: 4,
} as const;

export interface Gauge {
  key: string;
  label: string;
  /** 平均 (1〜5)。入力済みのブキがなければ null */
  value: number | null;
}

export interface Advice {
  kind: 'warn' | 'good' | 'role';
  text: string;
}

export interface CheckResult {
  /** 入っているブキの数 */
  count: number;
  gauges: Gauge[];
  /** 最長射程・平均射程 (ライン本数) */
  maxRange: number | null;
  avgRange: number | null;
  /** オブジェクト担当の順位 (ブキの枠の番号) */
  objectRank: number[];
  advice: Advice[];
}

const avg = (xs: (number | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** 枠 (null は未選択) の並びから編成を診断する */
export function checkComp(slots: (string | null)[], rule: CheckerRule): CheckResult {
  const filled = slots.map((id, i) => (id ? { i, id, t: weaponTactics(id) } : null)).filter((x): x is { i: number; id: string; t: WeaponTactics } => !!x);
  const ts = filled.map((x) => x.t);
  const obj = OBJECT[rule];
  const pick = (k: keyof WeaponTactics) => ts.map((t) => t[k] as Score | undefined);
  const gauges: Gauge[] = [
    { key: 'paintArea', label: '塗り拡張', value: avg(pick('paintArea')) },
    { key: 'paintBurst', label: '瞬間塗り', value: avg(pick('paintBurst')) },
    { key: 'kill', label: 'キル', value: avg(pick('kill')) },
    { key: 'entry', label: '打開', value: avg(pick('entry')) },
    { key: obj.key, label: obj.label, value: avg(pick(obj.key)) },
  ];
  const ranges = ts.map((t) => t.range).filter((x): x is number => typeof x === 'number');
  const maxRange = ranges.length ? Math.max(...ranges) : null;
  const avgRange = avg(ranges);
  const g = (k: string) => gauges.find((x) => x.key === k)!.value;

  const name = (id: string) => shortName(id);
  const warn: string[] = [];
  const good: string[] = [];
  // 4 人そろっていないときは、合計の傾向が分からないので判定しない
  if (filled.length === 4) {
    const T = THRESHOLDS;
    if (maxRange !== null && maxRange < T.shortRange) warn.push(`最長射程 ${maxRange.toFixed(1)} ライン: 正面の撃ち合いは不利。潜伏・裏取り・サブで距離を詰める`);
    if (maxRange !== null && maxRange >= T.longRange) {
      const longest = filled.find((x) => x.t.range === maxRange)!;
      good.push(`長射程の ${name(longest.id)} を軸に、高台から前線を押し上げる`);
    }
    const paint = g('paintArea');
    if (paint !== null && paint <= (rule === 'エリア' ? T.lowPaintArea : T.lowPaint)) warn.push('塗り拡張が少ない: 塗り合いは不利。キルで人数有利を作ってから塗る');
    else if (paint !== null && paint >= T.highPaint) good.push('塗り拡張が高い: 塗り広げてスペシャルを回し、物量で押す');
    const burst = g('paintBurst');
    if (burst !== null && burst <= T.lowBurst) warn.push('瞬間塗りが弱い: 足場を奪われやすい。対面の前に足元を塗っておく');
    const kill = g('kill');
    if (kill !== null && kill <= T.lowKill) warn.push('キル力が低い: 1 対 1 は避け、2 人で詰める');
    else if (kill !== null && kill >= T.highKill) good.push('キル力が高い: 対面で人数有利を作り、そのまま押し込む');
    const entry = g('entry');
    const entrySp = ts.filter((t) => t.specialCategories.includes('打開・起点')).length;
    if ((entry !== null && entry <= T.lowEntry) || (ts.every((t) => t.specialCategories.length) && entrySp === 0)) {
      warn.push('打開力不足: 単独での打開は NG。スペシャル 2 枚を合わせるか、1 キルを起点にする');
    } else if (entry !== null && entry >= T.highEntry) good.push('打開力が高い: 押し込まれても、スペシャルを合わせれば一気に返せる');
    const roles = ts.map((t) => t.role);
    if (roles.filter((r) => r === '後衛').length >= 2) warn.push('後衛が 2 人: 前線が薄い。前衛は無理に前へ出ず、人数をそろえてから仕掛ける');
    if (roles.every((r) => r) && !roles.includes('前衛')) warn.push('前衛がいない: 前線を押し上げる役を先に決めておく');
    if (rule === 'エリア' && ts.filter((t) => t.specialCategories.includes('エリア確保')).length >= 2) good.push('エリア確保のスペシャルが 2 枚以上: スペシャルでカウントを取り返せる');
  }

  // オブジェクト担当: 関与の高い順 (同点は枠の順)
  const objectRank = filled
    .filter((x) => typeof x.t[obj.key] === 'number')
    .sort((a, b) => (b.t[obj.key] as number) - (a.t[obj.key] as number) || a.i - b.i)
    .map((x) => x.i);
  const advice: Advice[] = [...warn.map((text) => ({ kind: 'warn' as const, text })), ...good.map((text) => ({ kind: 'good' as const, text }))].slice(0, 4);
  if (objectRank.length >= 2) {
    advice.push({ kind: 'role', text: `${obj.duty}: 第 1 候補 ${name(slots[objectRank[0]]!)}、第 2 候補 ${name(slots[objectRank[1]]!)}` });
  }
  return { count: filled.length, gauges, maxRange, avgRange, objectRank, advice };
}

/** 編成名 (ルール｜略称・略称・…) */
export function compName(slots: (string | null)[], rule: CheckerRule): string {
  return `${rule}｜${slots.filter((x): x is string => !!x).map(shortName).join('・')}`;
}

const ICON = { warn: '⚠️', good: '✅', role: '🎯' };

/** Discord 用のテキスト */
export function checkText(slots: (string | null)[], players: (string | null)[], rule: CheckerRule, r: CheckResult): string {
  const lines = [`**編成チェック｜${compName(slots, rule).split('｜')[1]}**（${rule}）`];
  const members = slots
    .map((id, i) => (id ? `${players[i] ? `${players[i]}: ` : ''}${getWeapon(id)?.name ?? id}` : null))
    .filter(Boolean);
  if (players.some(Boolean)) lines.push(members.join(' / '));
  const fmt = (v: number | null) => (v === null ? '-' : v.toFixed(1));
  lines.push([...r.gauges.map((x) => `${x.label} ${fmt(x.value)}`), `最長射程 ${fmt(r.maxRange)}`].join(' / '));
  for (const a of r.advice) lines.push(`${ICON[a.kind]} ${a.text}`);
  return lines.join('\n');
}
