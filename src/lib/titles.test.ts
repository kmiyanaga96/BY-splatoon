import { describe, expect, it } from 'vitest';
import { newGame, newLeague, newPlayer, newTournament } from '../model';
import type { AppData, Game, Tournament } from '../types';
import { computeLeague } from './league';
import { playerTitles } from './titles';

const win = (winner: 'A' | 'B'): Game => ({ ...newGame(), winner });

/** p1 のチーム (a) が優勝、p2 のチーム (b) が準優勝する 3 チームの総当たり */
function finished(name: string): Tournament {
  const t = newTournament(name);
  t.teams = (['a', 'b', 'c'] as const).map((id, i) => ({
    id,
    name: id,
    color: '',
    comment: '',
    members: [{ playerId: `p${i + 1}`, leader: true, featured: false, comment: '' }],
    pool: [],
    draws: {},
  }));
  t.league = newLeague(['a', 'b', 'c'], 1, true);
  const strength: Record<string, number> = { a: 3, b: 2, c: 1 };
  for (const m of computeLeague(t)[0].matches) {
    const [a, b] = [m.a, m.b].map((s) => (s.kind === 'team' ? s.id : ''));
    t.league.matches[m.key] = { a, b, games: [win(strength[a] > strength[b] ? 'A' : 'B'), win(strength[a] > strength[b] ? 'A' : 'B')], override: null, note: '' };
  }
  return t;
}

describe('優勝・準優勝の戦績', () => {
  const p1 = newPlayer('イカ');
  p1.id = 'p1';
  const p2 = newPlayer('タコ');
  p2.id = 'p2';
  p2.titles = [{ id: 'x', name: '昔の大会', rank: 1, date: '2025/8' }];
  const data: AppData = { version: 2, currentId: '', players: [p1, p2], tournaments: [finished('第1回'), finished('第2回')] };

  it('ツールの大会の成績から自動で数える (すべての大会)', () => {
    expect(playerTitles(data, p1)).toMatchObject({ gold: 2, silver: 0 });
    expect(playerTitles(data, p1).entries.map((e) => e.name)).toEqual(['第2回', '第1回']);
  });

  it('手で登録した戦績を足す', () => {
    const r = playerTitles(data, p2);
    expect(r).toMatchObject({ gold: 1, silver: 2 });
    expect(r.entries.at(-1)).toEqual({ name: '昔の大会', date: '2025/8', rank: 1, source: 'manual' });
  });

  it('表示中の大会は数えないようにできる', () => {
    expect(playerTitles(data, p1, data.tournaments[1].id).gold).toBe(1);
  });

  it('結果が確定していない大会・出場していない大会は数えない', () => {
    const t = finished('第3回');
    t.league!.matches = {};
    const p3 = newPlayer('クマ');
    expect(playerTitles({ ...data, tournaments: [t] }, p1).gold).toBe(0);
    expect(playerTitles(data, p3).entries).toEqual([]);
  });
});
