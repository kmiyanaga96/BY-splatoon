import { describe, expect, it } from 'vitest';
import { WEAPONS, getWeapon, hiddenByDefault, isOrderWeapon, unitKey } from './weapons';

describe('オーダーブキ', () => {
  const order = WEAPONS.filter(isOrderWeapon);

  it('オーダーブキは選択肢に出し、ヒーロー・オクタのレプリカは出さない', () => {
    expect(order.length).toBeGreaterThanOrEqual(11);
    for (const w of order) expect(hiddenByDefault(w)).toBe(false);
    expect(hiddenByDefault(getWeapon('Shooter_Normal_H')!)).toBe(true);
    expect(hiddenByDefault(getWeapon('Shooter_Normal_Oct')!)).toBe(true);
  });

  it('ブキ単位のルールでは、中身が同じ元のブキとして数える。メイン単位ではそのメイン', () => {
    expect(unitKey('weapon', 'Shooter_Normal_O')).toBe('Shooter_Normal_00');
    expect(unitKey('weapon', 'Saber_Normal_O')).toBe('Saber_Normal_00');
    expect(unitKey('main', 'Shooter_Normal_O')).toBe('Shooter_Normal');
    for (const w of order) {
      const base = getWeapon(unitKey('weapon', w.id))!;
      expect(base.replica).toBe(false);
      expect([base.sub, base.special]).toEqual([w.sub, w.special]);
    }
  });
});
