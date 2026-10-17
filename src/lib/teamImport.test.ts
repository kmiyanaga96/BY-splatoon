import { describe, expect, it } from 'vitest';
import { newLeague, newTournament } from '../model';
import type { Team, Tournament } from '../types';
import { importTeams } from './teamImport';

const team = (id: string, players: string[], pool: string[] = []): Team => ({
  id,
  name: `チーム${id}`,
  color: '#123456',
  comment: `${id} の紹介`,
  members: players.map((p, i) => ({ playerId: p, leader: i === 0, featured: false, comment: '' })),
  pool,
  draws: { [players[0]]: 'Shooter_Short_00' },
});

function source(): Tournament {
  const t = newTournament('前回');
  t.rules.poolUnit = 'weapon';
  t.teams = [team('a', ['p1', 'p2'], ['Shooter_Short_00', 'Shooter_Short_01']), team('b', ['p3', 'p4']), team('c', ['p5'])];
  return t;
}

describe('別の大会からチームを取り込む', () => {
  it('選んだチームを新しい ID で末尾に追加し、名前・色・紹介文・メンバーを引き継ぐ (抽選結果は引き継がない)', () => {
    const target = newTournament('今回');
    target.teams = [team('x', ['p9'])];
    const { teams } = importTeams(target, source(), ['a', 'c'], { pool: false });
    expect(target.teams.map((x) => x.name)).toEqual(['チームx', 'チームa', 'チームc']);
    expect(teams[0].id).not.toBe('a');
    expect(teams[0]).toMatchObject({ color: '#123456', comment: 'a の紹介', pool: [], draws: {} });
    expect(teams[0].members.map((m) => [m.playerId, m.leader])).toEqual([
      ['p1', true],
      ['p2', false],
    ]);
  });

  it('候補ブキは取り込み先の単位にそろえる (ブキ → メイン)', () => {
    const target = newTournament('今回');
    target.rules.poolUnit = 'main';
    const { teams } = importTeams(target, source(), ['a'], { pool: true });
    expect(teams[0].pool).toHaveLength(1);
  });

  it('候補ブキを使わない大会 (通常ルール) には候補ブキを入れない', () => {
    const target = newTournament('今回');
    target.rules.kind = 'free';
    expect(importTeams(target, source(), ['a'], { pool: true }).teams[0].pool).toEqual([]);
  });

  it('取り込み先ですでにチームにいる選手は外す', () => {
    const target = newTournament('今回');
    target.teams = [team('x', ['p2'])];
    const r = importTeams(target, source(), ['a', 'b'], { pool: false });
    expect(r.teams[0].members.map((m) => m.playerId)).toEqual(['p1']);
    expect(r.skippedPlayerIds).toEqual(['p2']);
  });

  it('1 グループのリーグ戦ならグループにも入れる。複数グループなら入れない (予選ページで振り分け)', () => {
    const only = newTournament('総当たり');
    only.league = newLeague([], 2, true);
    importTeams(only, source(), ['a', 'b'], { pool: false });
    expect(only.league.groups[0].teamIds).toEqual(only.teams.map((x) => x.id));

    const qualifier = newTournament('予選あり');
    qualifier.teams = [team('x', ['p8']), team('y', ['p9'])];
    qualifier.league = newLeague(['x', 'y'], 2);
    importTeams(qualifier, source(), ['a'], { pool: false });
    expect(qualifier.league.groups.flatMap((g) => g.teamIds)).toEqual(['x', 'y']);
  });
});
