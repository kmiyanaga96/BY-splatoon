import { describe, expect, it } from 'vitest';
import { getWeapon } from '../data/weapons';
import { roulettePool, spin } from './roulette';

describe('ブキルーレット', () => {
  it('カテゴリとレプリカの有無で対象を絞る', () => {
    const chargers = roulettePool({ categories: ['Charger'], replica: false });
    expect(chargers.length).toBeGreaterThan(0);
    expect(chargers.every((w) => w.category === 'Charger' && !w.replica)).toBe(true);
    expect(roulettePool({ categories: [], replica: true }).some((w) => w.replica)).toBe(true);
  });

  it('重複なしなら同じブキが重ならない (対象が足りないときは重なりを許す)', () => {
    const pool = roulettePool({ categories: [], replica: false });
    for (let k = 0; k < 20; k++) {
      const r = spin(8, pool, true);
      expect(new Set(r).size).toBe(8);
    }
    const two = pool.slice(0, 2);
    expect(spin(4, two, true)).toHaveLength(4);
  });

  it('残す枠はそのままにして、ほかの枠だけ回し直す', () => {
    const pool = roulettePool({ categories: [], replica: false });
    const r = spin(4, pool, true, new Map([[1, 'Shooter_Short_00']]));
    expect(r[1]).toBe('Shooter_Short_00');
    expect(r.filter((id) => id === 'Shooter_Short_00')).toHaveLength(1);
    expect(r.every((id) => !!getWeapon(id))).toBe(true);
  });
});
