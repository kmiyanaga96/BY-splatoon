import raw from './weapons.json';

export interface Weapon {
  id: string;
  name: string;
  category: string;
  main: string;
  sub: string;
  special: string;
  sp: number;
  replica: boolean;
}

export const WEAPON_DATA_VERSION: string = raw.version;
export const WEAPONS: Weapon[] = raw.weapons;

const byId = new Map(WEAPONS.map((w) => [w.id, w]));

export function getWeapon(id: string): Weapon | undefined {
  return byId.get(id);
}

/**
 * メイン (同じメインを持つブキのまとまり。例: ボールドマーカーとボールドマーカーネオ)。
 * ID は Weapon.main (例: Shooter_Short)。ブキの ID (Shooter_Short_00) とは重ならない。
 */
export interface MainWeapon {
  id: string;
  /** 「ボールドマーカー系」のような表示名 */
  name: string;
  category: string;
  /** 代表ブキ (アイコンに使う。レプリカでない最初のブキ) */
  base: Weapon;
  variants: Weapon[];
}

export const MAINS: MainWeapon[] = (() => {
  const groups = new Map<string, Weapon[]>();
  for (const w of WEAPONS) groups.set(w.main, [...(groups.get(w.main) ?? []), w]);
  return [...groups].map(([id, variants]) => {
    const base = variants.find((w) => !w.replica) ?? variants[0];
    return { id, name: `${base.name}系`, category: base.category, base, variants };
  });
})();

const mainById = new Map(MAINS.map((m) => [m.id, m]));

export function getMain(id: string): MainWeapon | undefined {
  return mainById.get(id);
}

/**
 * 候補・再使用の判定に使うキー。メイン単位のルールでは派生ブキをメインにまとめる。
 * id はブキ ID でもメイン ID でもよい。
 */
export function unitKey(unit: 'weapon' | 'main', id: string): string {
  if (unit === 'main') return byId.get(id)?.main ?? id;
  return mainById.get(id)?.base.id ?? id;
}

/** ブキアイコン (public/weapons/ の静的ファイル)。scripts/fetch-weapon-icons.mjs で取得。メインは代表ブキのアイコン */
export function weaponIconUrl(id: string): string {
  const wid = mainById.get(id)?.base.id ?? id;
  return byId.has(wid) ? `${import.meta.env.BASE_URL}weapons/${wid}.png` : '';
}

/** ブキ名。メイン ID なら「〇〇系」 */
export function weaponName(id: string): string {
  return byId.get(id)?.name ?? mainById.get(id)?.name ?? (id ? `不明なブキ(${id})` : '');
}

/** サブ・スペシャル (ブキ) / 含まれるブキの一覧 (メイン) の補足 */
export function weaponKit(id: string, withReplica = false): string {
  const w = byId.get(id);
  if (w) return `${w.sub} / ${w.special}`;
  const m = mainById.get(id);
  return m ? m.variants.filter((v) => withReplica || !v.replica).map((v) => v.name).join(' / ') : '';
}

export const CATEGORIES: { id: string; name: string; color: string }[] = [
  { id: 'Shooter', name: 'シューター', color: '#e8e04a' },
  { id: 'Blaster', name: 'ブラスター', color: '#f08a3c' },
  { id: 'Roller', name: 'ローラー', color: '#5cc3f0' },
  { id: 'Brush', name: 'フデ', color: '#64d6b4' },
  { id: 'Charger', name: 'チャージャー', color: '#c67cf2' },
  { id: 'Slosher', name: 'スロッシャー', color: '#4c8df5' },
  { id: 'Spinner', name: 'スピナー', color: '#f25c8f' },
  { id: 'Maneuver', name: 'マニューバー', color: '#9be15d' },
  { id: 'Shelter', name: 'シェルター', color: '#f5b84c' },
  { id: 'Stringer', name: 'ストリンガー', color: '#ff7a6b' },
  { id: 'Saber', name: 'ワイパー', color: '#b0a6ff' },
];

export function categoryOf(id: string) {
  const c = byId.get(id)?.category ?? mainById.get(id)?.category;
  return CATEGORIES.find((x) => x.id === c);
}

/** ひらがな→カタカナ・全角英数→半角・小文字化して検索しやすくする */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase()
    .replace(/[\s・.]/g, '');
}

const searchIndex = new Map(
  WEAPONS.map((w) => [w.id, normalizeForSearch(`${w.name} ${w.sub} ${w.special}`)]),
);

export function matchesQuery(w: Weapon, query: string): boolean {
  const q = normalizeForSearch(query);
  return !q || (searchIndex.get(w.id) ?? '').includes(q);
}

/** メインは含まれるどれかのブキが当たれば一致 */
export function mainMatchesQuery(m: MainWeapon, query: string): boolean {
  return m.variants.some((w) => matchesQuery(w, query));
}
