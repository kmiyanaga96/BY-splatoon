import { describe, expect, it } from 'vitest';
import { newTournament } from '../model';
import { rulesText } from './announce';
import { kindOf } from './kinds';

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
