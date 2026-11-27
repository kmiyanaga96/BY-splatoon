import { describe, expect, it, vi } from 'vitest';

vi.mock('../data/tactics.json', () => ({
  default: {
    mains: { Shooter_Normal: { role: '前衛', range: 2.5, paintArea: 3, kill: 3 } },
    kits: { Shooter_Normal_00: { entry: 3, tags: ['ボム持ち'], short: 'スシ' } },
    specials: { SpUltraShot: ['打開・起点', 'エリア確保'] },
    kitSpecial: { Shooter_Normal_00: 'SpUltraShot', Shooter_Normal_01: 'SpTripleTornado' },
  },
}));

const { shortName, weaponTactics } = await import('./tactics');

describe('戦術データ', () => {
  it('メインの値・ブキの値・スペシャルの分類をまとめる', () => {
    expect(weaponTactics('Shooter_Normal_00')).toEqual({
      weaponId: 'Shooter_Normal_00',
      role: '前衛',
      range: 2.5,
      paintArea: 3,
      kill: 3,
      entry: 3,
      tags: ['ボム持ち'],
      short: 'スシ',
      specialCategories: ['打開・起点', 'エリア確保'],
    });
  });

  it('同じメインのブキはメインの値を共有し、未入力の項目は undefined', () => {
    const t = weaponTactics('Shooter_Normal_01');
    expect(t.range).toBe(2.5);
    expect(t.entry).toBeUndefined();
    expect(t.specialCategories).toEqual([]);
  });

  it('レプリカは元のブキの値を使う', () => {
    expect(weaponTactics('Shooter_Normal_H').entry).toBe(3);
  });

  it('略称がなければ正式名', () => {
    expect(shortName('Shooter_Normal_00')).toBe('スシ');
    expect(shortName('Shooter_Normal_01')).toBe('スプラシューターコラボ');
  });
});
