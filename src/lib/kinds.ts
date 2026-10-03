// 大会の種類ごとの違い (ADR 0002)。画面側は種類を直接見ずに、この表の項目で出し分ける。
// 特殊ルール (カテゴリ縛り・ランダムブキ・サブ/スペシャル縛り) を足すときは、TournamentKind と KINDS に 1 行足す。

import { CATEGORIES, WEAPONS, type Weapon } from '../data/weapons';
import type { RandomTiming, Tournament, TournamentKind } from '../types';

export interface KindInfo {
  label: string;
  /** 設定画面での説明 */
  description: string;
  /** チームが候補ブキを事前登録する (候補の単位・登録上限・再使用ルール・ブキ表を使う) */
  hasPool: boolean;
  /** 試合記録でチームの使用ブキを 1 つ入力する */
  teamWeapon: boolean;
  /** 試合記録で選手ごとの使用ブキを入力する (「記録」ページで集計) */
  playerWeapons: boolean;
}

export const KINDS: Record<TournamentKind, KindInfo> = {
  unified: {
    label: 'ブキ統一杯',
    description: 'チームで候補ブキを事前登録し、各ゲームでチーム全員が同じブキを使う',
    hasPool: true,
    teamWeapon: true,
    playerWeapons: false,
  },
  category: {
    label: 'カテゴリ縛り',
    description: '運営が指定したカテゴリのブキだけ使える。各ゲームで選手ごとの使用ブキを記録する',
    hasPool: false,
    teamWeapon: false,
    playerWeapons: true,
  },
  random: {
    label: 'ランダムブキ',
    description: 'アプリで選手ごとにブキを抽選する（抽選のタイミングは下で選ぶ）',
    hasPool: false,
    teamWeapon: false,
    playerWeapons: true,
  },
  free: {
    label: '通常ルール',
    description: 'ブキは自由。候補ブキの登録やブキ表は使わない',
    hasPool: false,
    teamWeapon: false,
    playerWeapons: true,
  },
};

export const KIND_OPTIONS = (Object.keys(KINDS) as TournamentKind[]).map((value) => ({ value, label: KINDS[value].label }));

export function kindOf(t: Tournament): KindInfo {
  return KINDS[t.rules.kind];
}

/** 選手ごとのブキ入力で選べるブキ (カテゴリ縛りなら指定カテゴリだけ。指定がなければ全カテゴリ) */
export function selectableWeapons(t: Tournament): Weapon[] {
  const cats = t.rules.kind === 'category' ? t.rules.categories : [];
  return WEAPONS.filter((w) => !cats.length || cats.includes(w.category));
}

export const RANDOM_TIMING_LABEL: Record<RandomTiming, string> = {
  game: 'ゲームごと',
  match: '試合（セット）ごと',
  tournament: '大会で 1 回',
};

/** 指定カテゴリの表示名 (例: シューター / チャージャー) */
export function categoryNames(ids: string[]): string {
  return ids.map((id) => CATEGORIES.find((c) => c.id === id)?.name ?? id).join(' / ');
}
