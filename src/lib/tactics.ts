// ブキの戦術データ (編成チェッカー用)。
// 値は運営が data/tactics/*.csv に入力し、`npm run tactics:check` で src/data/tactics.json に変換する。
// 未入力の項目は undefined になる (編成チェッカーではその項目を数えない)。
import raw from '../data/tactics.json';
import { getWeapon, unitKey } from '../data/weapons';

export type WeaponRole = '前衛' | '中衛' | '後衛' | 'サポート';
export type SpecialCategory = '打開・起点' | '抑え・遅延' | 'エリア確保' | '敵を動かす';
export type Score = 1 | 2 | 3 | 4 | 5;

/** メイン性能で決まる値 (同じメインのブキは共通) */
export interface MainSpec {
  role?: WeaponRole;
  /** 有効射程 (試し撃ちのライン本数、0.1 刻み) */
  range?: number;
  /** 塗り拡張: 時間あたりに広く塗る力 */
  paintArea?: Score;
  /** 瞬間塗り: 対面中に足場を作る・奪う力 */
  paintBurst?: Score;
  kill?: Score;
  objArea?: Score;
  objTower?: Score;
  objRainmaker?: Score;
  objClam?: Score;
}

/** ブキ (メイン + サブ + スペシャル) ごとの値 */
export interface KitSpec {
  /** 打開力 (メイン + サブ・スペシャルの総合) */
  entry?: Score;
  tags?: string[];
  /** 編成名などに使う短い名前 */
  short?: string;
}

/** 1 つのブキの戦術データをまとめたもの */
export interface WeaponTactics extends MainSpec, KitSpec {
  weaponId: string;
  specialCategory?: SpecialCategory;
}

interface TacticsData {
  mains: Record<string, MainSpec>;
  kits: Record<string, KitSpec>;
  specials: Record<string, SpecialCategory>;
  kitSpecial: Record<string, string>;
}

const data = raw as unknown as TacticsData;

/** ブキの戦術データ。レプリカは元のブキの値を使う */
export function weaponTactics(weaponId: string): WeaponTactics {
  const base = unitKey('weapon', weaponId);
  const main = getWeapon(base)?.main ?? '';
  return {
    weaponId,
    ...data.mains[main],
    ...data.kits[base],
    specialCategory: data.specials[data.kitSpecial[base] ?? ''],
  };
}

/** 表示用の短い名前 (略称がなければ正式名) */
export function shortName(weaponId: string): string {
  return weaponTactics(weaponId).short ?? getWeapon(weaponId)?.name ?? weaponId;
}
