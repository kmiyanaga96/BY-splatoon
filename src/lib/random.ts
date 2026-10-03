// ランダムブキの抽選。選手ごとに、レプリカを除く全ブキから 1 つずつ選ぶ。

import { WEAPONS } from '../data/weapons';

const POOL = WEAPONS.filter((w) => !w.replica);

/** 選手ごとにブキを抽選する (Player.id -> Weapon.id)。rand はテスト用に差し替えられる */
export function drawWeapons(playerIds: string[], rand: () => number = Math.random): Record<string, string> {
  return Object.fromEntries(playerIds.map((id) => [id, POOL[Math.floor(rand() * POOL.length)].id]));
}
