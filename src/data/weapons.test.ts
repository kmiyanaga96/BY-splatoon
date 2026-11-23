import { describe, expect, it } from 'vitest';
import { WEAPONS, getWeapon, unitKey } from './weapons';

describe('レプリカ (ヒーロー・オクタ・オーダー・PET)', () => {
  const replicas = WEAPONS.filter((w) => w.replica);

  it('ヒーロー・オクタ・PET・オーダー 11 種がレプリカとして入っている', () => {
    expect(replicas.map((w) => w.id)).toEqual(expect.arrayContaining(['Shooter_Normal_H', 'Shooter_Normal_Oct', 'Shooter_Normal_S', 'Shooter_Normal_O']));
    expect(replicas.filter((w) => w.id.endsWith('_O'))).toHaveLength(11);
    expect(getWeapon('Shooter_Normal_S')?.name).toBe('PETシューター レプリカ');
  });

  it('ブキ単位のルールでは、中身が同じ元のブキとして数える。メイン単位ではそのメイン', () => {
    expect(unitKey('weapon', 'Shooter_Normal_O')).toBe('Shooter_Normal_00');
    expect(unitKey('weapon', 'Shooter_Normal_H')).toBe('Shooter_Normal_00');
    expect(unitKey('weapon', 'Shooter_Normal_Oct')).toBe('Shooter_Normal_01');
    expect(unitKey('weapon', 'Shooter_Normal_S')).toBe('Shooter_Normal_01');
    expect(unitKey('main', 'Shooter_Normal_S')).toBe('Shooter_Normal');
    for (const w of replicas) {
      const base = getWeapon(unitKey('weapon', w.id))!;
      expect(base.replica).toBe(false);
      expect([base.sub, base.special]).toEqual([w.sub, w.special]);
    }
  });
});
