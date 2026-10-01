import { describe, expect, it } from 'vitest';
import { newTournament } from '../model';
import type { AppData, Game } from '../types';
import { createSlots } from './bracket';
import { playerStats } from './stats';

const game = (winner: 'A' | 'B', weaponA: string, lineupA: string[] | null = null): Game => ({
  weaponA,
  weaponB: 'w-opp',
  mode: '',
  stage: '',
  winner,
  lineupA,
  lineupB: null,
});

describe('playerStats', () => {
  const t = newTournament('杯');
  t.teams = [
    {
      id: 'A',
      name: 'A',
      color: '#f00',
      comment: '',
      pool: [],
      members: ['p1', 'p2', 'p3', 'p4', 'sub'].map((playerId) => ({ playerId, leader: false, featured: false, comment: '' })),
    },
    { id: 'B', name: 'B', color: '#00f', comment: '', pool: [], members: [] },
  ];
  t.rules.finalBestOf = 3; // 2 チームなので 1 回戦が決勝
  t.bracket.slots = createSlots(['A', 'B']);
  t.bracket.matches['0-0'] = {
    a: 'A',
    b: 'B',
    games: [game('A', 'w1', ['p1', 'p2', 'p3', 'p4']), game('B', 'w2', ['p1', 'p2', 'p3', 'sub']), game('A', 'w1', ['p1', 'p2', 'p3', 'p4'])],
    override: null,
    note: '',
  };
  const data: AppData = { version: 2, currentId: t.id, players: [], tournaments: [t] };

  it('出場したゲームだけを数える', () => {
    const p4 = playerStats(data, 'p4');
    expect(p4.games).toBe(2);
    expect(p4.wins).toBe(2);
    expect(p4.weapons).toEqual([{ weaponId: 'w1', games: 2, wins: 2 }]);

    const sub = playerStats(data, 'sub');
    expect(sub.games).toBe(1);
    expect(sub.weapons).toEqual([{ weaponId: 'w2', games: 1, wins: 0 }]);
  });

  it('大会成績を返す', () => {
    const p1 = playerStats(data, 'p1');
    expect(p1.results).toHaveLength(1);
    expect(p1.results[0].placement).toEqual({ rank: 1, label: '優勝' });
    expect(p1.weapons[0]).toEqual({ weaponId: 'w1', games: 2, wins: 2 });
  });
});
