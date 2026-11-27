// ランダムブキルーレット (ツールモード)。大会の機能とは切り離した、その場で遊ぶためのもの。

import { WEAPONS, type Weapon } from '../data/weapons';

export interface RouletteOptions {
  /** 使うカテゴリ (空ならすべて) */
  categories: string[];
  /** レプリカ (ヒーロー・オーダーなど。中身は元のブキと同じ) も入れる */
  replica: boolean;
}

/** 抽選の対象になるブキ */
export function roulettePool(opts: RouletteOptions): Weapon[] {
  return WEAPONS.filter((w) => (opts.replica || !w.replica) && (!opts.categories.length || opts.categories.includes(w.category)));
}

/**
 * n 人分のブキを抽選する。unique なら同じブキが重ならないようにする (対象が足りなければ重なりを許す)。
 * keep に入っている枠 (index → ブキ ID) はそのまま残す (1 枠だけ回し直す用)
 */
export function spin(n: number, pool: Weapon[], unique: boolean, keep: Map<number, string> = new Map(), rand: () => number = Math.random): string[] {
  if (!pool.length) return [];
  const used = new Set(keep.values());
  return Array.from({ length: n }, (_, i) => {
    const kept = keep.get(i);
    if (kept) return kept;
    const candidates = unique ? pool.filter((w) => !used.has(w.id)) : pool;
    const from = candidates.length ? candidates : pool;
    const w = from[Math.floor(rand() * from.length)];
    used.add(w.id);
    return w.id;
  });
}
