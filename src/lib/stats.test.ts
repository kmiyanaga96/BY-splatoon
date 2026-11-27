import { describe, expect, it } from 'vitest';
import { newTournament } from '../model';
import type { AppData, Game } from '../types';
import { createSlots } from './bracket';
import { usageBy } from './records';
import { overallPicks, playerStats } from './stats';

const game = (winner: 'A' | 'B', weaponA: string, lineupA: string[] | null = null): Game => ({
  weaponA,
  weaponB: 'w-opp',
  mode: '',
  stage: '',
  winner,
  lineupA,
  lineupB: null,
  picksA: null,
  picksB: null,
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
      draws: {},
      members: ['p1', 'p2', 'p3', 'p4', 'sub'].map((playerId) => ({ playerId, leader: false, featured: false, comment: '' })),
    },
    { id: 'B', name: 'B', color: '#00f', comment: '', pool: [], draws: {}, members: [] },
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
    expect(p4.weapons).toEqual([{ weaponId: 'w1', games: 2, wins: 2, decided: 2 }]);

    const sub = playerStats(data, 'sub');
    expect(sub.games).toBe(1);
    expect(sub.weapons).toEqual([{ weaponId: 'w2', games: 1, wins: 0, decided: 1 }]);
  });

  it('大会成績を返す', () => {
    const p1 = playerStats(data, 'p1');
    expect(p1.results).toHaveLength(1);
    expect(p1.results[0].placement).toEqual({ rank: 1, label: '優勝' });
    expect(p1.weapons[0]).toEqual({ weaponId: 'w1', games: 2, wins: 2, decided: 2 });
  });

  it('ルール別の勝率を数え、勝敗が未入力のゲームは勝率の分母に入れない', () => {
    const t2 = structuredClone(t);
    t2.id = 't2';
    t2.bracket.matches['0-0'].games = [
      { ...game('A', 'w1'), mode: 'エリア' },
      { ...game('B', 'w1'), mode: 'エリア' },
      { ...game('A', 'w1'), mode: 'ホコ' },
      { ...game('A', 'w1'), mode: 'ホコ', winner: null },
    ];
    const s = playerStats({ ...data, tournaments: [t2] }, 'p1');
    expect(s).toMatchObject({ games: 4, wins: 2, decided: 3 });
    expect(s.modes).toEqual([
      { mode: 'エリア', games: 2, wins: 1, decided: 2 },
      { mode: 'ホコ', games: 2, wins: 1, decided: 1 },
    ]);
  });

  it('通算の集計はすべての大会の使用ブキをルールつきで集める', () => {
    const t2 = structuredClone(t);
    t2.id = 't2';
    t2.bracket.matches['0-0'].games = [{ ...game('A', 'w3'), mode: 'ヤグラ' }];
    const picks = overallPicks({ ...data, tournaments: [t, t2] });
    expect(new Set(picks.map((p) => p.tournamentId))).toEqual(new Set([t.id, 't2']));
    const yagura = picks.filter((p) => p.mode === 'ヤグラ');
    expect(usageBy(yagura, 'weapon').map((r) => [r.id, r.uses, r.wins])).toEqual([['w3', 5, 5]]);
  });
});

