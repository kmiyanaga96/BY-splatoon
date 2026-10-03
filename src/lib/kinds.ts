// 大会の種類ごとの違い (ADR 0002)。画面側は種類を直接見ずに、この表の項目で出し分ける。
// 特殊ルール (カテゴリ縛り・ランダムブキ・サブ/スペシャル縛り) を足すときは、TournamentKind と KINDS に 1 行足す。

import type { Tournament, TournamentKind } from '../types';

export interface KindInfo {
  label: string;
  /** 設定画面での説明 */
  description: string;
  /** チームが候補ブキを事前登録する (候補の単位・登録上限・再使用ルール・ブキ表を使う) */
  hasPool: boolean;
  /** 試合記録でチームの使用ブキを 1 つ入力する */
  teamWeapon: boolean;
}

export const KINDS: Record<TournamentKind, KindInfo> = {
  unified: {
    label: 'ブキ統一杯',
    description: 'チームで候補ブキを事前登録し、各ゲームでチーム全員が同じブキを使う',
    hasPool: true,
    teamWeapon: true,
  },
  free: {
    label: '通常ルール',
    description: 'ブキは自由。候補ブキの登録やブキ表は使わない',
    hasPool: false,
    teamWeapon: false,
  },
};

export const KIND_OPTIONS = (Object.keys(KINDS) as TournamentKind[]).map((value) => ({ value, label: KINDS[value].label }));

export function kindOf(t: Tournament): KindInfo {
  return KINDS[t.rules.kind];
}
