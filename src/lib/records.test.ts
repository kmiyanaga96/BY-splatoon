import { describe, expect, it } from 'vitest';
import { newGame, newTournament, normalizeData } from '../model';
import type { Game, Tournament } from '../types';
import { computeBracket, createSlots } from './bracket';
import { allPicks, gamePicks, percent, usageBy } from './records';
import { playerStats } from './stats';

const g = (winner: 'A' | 'B' | null, picksA: Record<string, string> | null, weaponA = ''): Game => ({
  ...newGame(),
  winner,
  weaponA,
  picksA,
});

function setup(): Tournament {
  const t = newTournament();
  t.rules.kind = 'free';
  t.teams = ['t1', 't2'].map((id) => ({
    id,
    name: id,
    color: '',
    comment: '',
    members: [`${id}-p1`, `${id}-p2`].map((playerId) => ({ playerId, leader: false, featured: false, comment: '' })),
    pool: [],
    draws: {},
  }));
  t.bracket.slots = createSlots(['t1', 't2']);
  t.bracket.matches['0-0'] = {
    a: 't1',
    b: 't2',
    games: [
      g('A', { 't1-p1': 'Shooter_Short_00', 't1-p2': 'Charger_Normal_00' }),
      g('B', { 't1-p1': 'Shooter_Short_00' }),
    ],
    override: null,
    note: '',
  };
  return t;
}

describe('選手ごとのブキ記録', () => {
  it('入力した人だけ数え、未入力の人は含めない', () => {
    const t = setup();
    const picks = allPicks(t, computeBracket(t));
    expect(picks.map((p) => [p.playerId, p.weaponId, p.won])).toEqual([
      ['t1-p1', 'Shooter_Short_00', true],
      ['t1-p2', 'Charger_Normal_00', true],
      ['t1-p1', 'Shooter_Short_00', false],
    ]);
  });

  it('選手ごとの記録がなければチームのブキを出場メンバー全員の使用とする (ブキ統一杯)', () => {
    const team = setup().teams[0];
    expect([...gamePicks(team, g(null, null, 'Roller_Normal_00'), 'A')]).toEqual([
      ['t1-p1', 'Roller_Normal_00'],
      ['t1-p2', 'Roller_Normal_00'],
    ]);
  });

  it('ブキ別・カテゴリ別の使用数と勝率', () => {
    const t = setup();
    const picks = allPicks(t, computeBracket(t));
    expect(usageBy(picks, 'weapon')).toEqual([
      { id: 'Shooter_Short_00', uses: 2, wins: 1, decided: 2 },
      { id: 'Charger_Normal_00', uses: 1, wins: 1, decided: 1 },
    ]);
    expect(usageBy(picks, 'category').map((r) => r.id)).toEqual(['Shooter', 'Charger']);
    expect(percent(2, 3)).toBe('67%');
    expect(percent(1, 0)).toBe('-');
  });

  it('選手ページの集計も選手ごとの記録を使う', () => {
    const t = setup();
    const stats = playerStats({ version: 2, currentId: t.id, players: [], tournaments: [t] }, 't1-p2');
    expect(stats.weapons).toEqual([{ weaponId: 'Charger_Normal_00', games: 1, wins: 1 }]);
    expect(stats.games).toBe(2);
  });

  it('次のゲームは前のゲームの選手ごとのブキを引き継ぐ', () => {
    const prev = g('A', { p: 'Shooter_Short_00' });
    const next = newGame(prev);
    expect(next.picksA).toEqual({ p: 'Shooter_Short_00' });
    expect(next.picksA).not.toBe(prev.picksA);
  });

  it('読み込み時に空の値や文字列以外を取り除く', () => {
    const d = normalizeData({
      tournaments: [
        {
          id: 'x',
          teams: [{ id: 'a' }, { id: 'b' }],
          bracket: {
            slots: ['a', 'b'],
            matches: { '0-0': { a: 'a', b: 'b', games: [{ picksA: { p1: 'Shooter_Short_00', p2: '', p3: 5 }, picksB: {} }] } },
          },
        },
      ],
    });
    const game = d.tournaments[0].bracket.matches['0-0'].games[0];
    expect(game.picksA).toEqual({ p1: 'Shooter_Short_00' });
    expect(game.picksB).toBeNull();
  });
});
