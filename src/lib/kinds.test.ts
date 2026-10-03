import { describe, expect, it } from 'vitest';
import { getWeapon } from '../data/weapons';
import { newTournament, normalizeData } from '../model';
import { rulesText } from './announce';
import { kindOf, selectableWeapons } from './kinds';
import { drawWeapons } from './random';

describe('大会の種類ごとの出し分け', () => {
  it('通常ルールは候補ブキを使わず、ルール文はブキ自由', () => {
    const t = newTournament();
    t.rules.kind = 'free';
    expect(kindOf(t)).toMatchObject({ hasPool: false, teamWeapon: false });
    expect(rulesText(t)).toBe('・1チーム 4 人、ブキは自由\n・各試合 BO3（2勝先取）、決勝は BO5（3勝先取）');
  });

  it('ブキ統一杯は候補ブキのルールを載せる', () => {
    const t = newTournament();
    expect(kindOf(t)).toMatchObject({ hasPool: true, teamWeapon: true });
    expect(rulesText(t)).toContain('候補ブキはメインを 2 種まで');
  });
});

describe('カテゴリ縛り', () => {
  it('選べるブキは指定カテゴリだけ。ルール文にカテゴリを載せる', () => {
    const t = newTournament();
    t.rules.kind = 'category';
    t.rules.categories = ['Charger', 'Saber'];
    const cats = new Set(selectableWeapons(t).map((w) => w.category));
    expect([...cats].sort()).toEqual(['Charger', 'Saber']);
    expect(rulesText(t)).toContain('チャージャー / ワイパー のブキのみ');
  });

  it('カテゴリ縛り以外の大会は全ブキを選べる', () => {
    const t = newTournament();
    t.rules.kind = 'free';
    t.rules.categories = ['Charger'];
    expect(selectableWeapons(t).length).toBeGreaterThan(100);
  });
});

describe('ランダムブキ', () => {
  it('選手ごとにレプリカ以外のブキを抽選する', () => {
    let n = 0;
    const picks = drawWeapons(['p1', 'p2', 'p3'], () => [0, 0.5, 0.999][n++]);
    expect(Object.keys(picks)).toEqual(['p1', 'p2', 'p3']);
    for (const id of Object.values(picks)) expect(getWeapon(id)?.replica).toBe(false);
    expect(new Set(Object.values(picks)).size).toBe(3);
  });

  it('ルール文に抽選のタイミングを載せる', () => {
    const t = newTournament();
    t.rules.kind = 'random';
    t.rules.randomTiming = 'match';
    expect(rulesText(t)).toContain('ブキは選手ごとに抽選（試合（セット）ごと）');
  });

  it('読み込み時に知らないカテゴリ・タイミングを外し、抽選結果を補完する', () => {
    const d = normalizeData({
      tournaments: [
        {
          id: 'x',
          teams: [{ id: 'a', draws: { p1: 'Shooter_Short_00', p2: 3 } }, { id: 'b' }],
          rules: { kind: 'random', categories: ['Charger', 'Bogus'], randomTiming: 'sometimes' },
        },
      ],
    });
    const t = d.tournaments[0];
    expect(t.rules).toMatchObject({ kind: 'random', categories: ['Charger'], randomTiming: 'game' });
    expect(t.teams.map((x) => x.draws)).toEqual([{ p1: 'Shooter_Short_00' }, {}]);
  });
});
