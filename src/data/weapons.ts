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

export function weaponName(id: string): string {
  return byId.get(id)?.name ?? (id ? `不明なブキ(${id})` : '');
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
  const c = byId.get(id)?.category;
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
