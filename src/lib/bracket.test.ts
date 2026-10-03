import { describe, expect, it } from 'vitest';
import { newTournament } from '../store';
import type { Game, Tournament } from '../types';
import { champion, computeBracket, createSlots, isAlive, placements, roundName, seedOrder, sideId } from './bracket';
import { blockedWeapons, poolStatus } from './usage';

const game = (winner: 'A' | 'B', weaponA = '', weaponB = ''): Game => ({ weaponA, weaponB, mode: '', stage: '', winner, lineupA: null, lineupB: null });

function setup(teamCount: number): Tournament {
  const t = newTournament();
  t.teams = Array.from({ length: teamCount }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    color: '',
    comment: '',
    members: [],
    pool: [],
  }));
  t.bracket.slots = createSlots(t.teams.map((x) => x.id));
  return t;
}

describe('seedOrder / createSlots', () => {
  it('標準シード順', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('不戦勝枠は上位シードの相手になる', () => {
    expect(createSlots(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', null, 'd', 'e', 'b', null, 'c', 'f']);
  });
});

describe('computeBracket', () => {
  it('不戦勝は自動で勝ち上がり、2 回戦のカードが決まる', () => {
    const t = setup(3); // 枠 4: [t1, bye, t2, t3]
    const rounds = computeBracket(t);
    expect(rounds).toHaveLength(2);
    expect(sideId(rounds[0][0].winner)).toBe('t1');
    expect(rounds[0][1].winner.kind).toBe('tbd');
    expect(sideId(rounds[1][0].a)).toBe('t1');
    expect(rounds[1][0].b.kind).toBe('tbd');
  });

  it('BO3 は 2 勝で勝ち抜け、決勝まで進むと優勝が決まる', () => {
    const t = setup(4); // [t1, t4, t2, t3]
    t.bracket.matches['0-0'] = { a: 't1', b: 't4', games: [game('A'), game('B'), game('A')], override: null, note: '' };
    t.bracket.matches['0-1'] = { a: 't2', b: 't3', games: [game('B'), game('B')], override: null, note: '' };
    let rounds = computeBracket(t);
    expect(sideId(rounds[1][0].a)).toBe('t1');
    expect(sideId(rounds[1][0].b)).toBe('t3');
    expect(champion(rounds)).toBeNull();
    expect(isAlive(rounds, 't2')).toBe(false);
    expect(isAlive(rounds, 't3')).toBe(true);

    // 決勝は BO5 なので 2 勝ではまだ決まらない
    t.bracket.matches['1-0'] = { a: 't1', b: 't3', games: [game('B'), game('B')], override: null, note: '' };
    expect(champion(computeBracket(t))).toBeNull();
    t.bracket.matches['1-0'].games.push(game('B'));
    rounds = computeBracket(t);
    expect(champion(rounds)).toBe('t3');
    expect(roundName(1, rounds.length)).toBe('決勝');
  });

  it('成績 (優勝・準優勝・ベスト4) を判定する', () => {
    const t = setup(4); // [t1, t4, t2, t3]
    t.bracket.matches['0-0'] = { a: 't1', b: 't4', games: [], override: 't1', note: '' };
    t.bracket.matches['0-1'] = { a: 't2', b: 't3', games: [], override: 't3', note: '' };
    expect(placements(computeBracket(t)).get('t4')).toEqual({ rank: 4, label: 'ベスト4' });
    expect(placements(computeBracket(t)).has('t1')).toBe(false); // まだ勝ち残り
    t.bracket.matches['1-0'] = { a: 't1', b: 't3', games: [], override: 't3', note: '' };
    const p = placements(computeBracket(t));
    expect(p.get('t3')).toEqual({ rank: 1, label: '優勝' });
    expect(p.get('t1')).toEqual({ rank: 2, label: '準優勝' });
  });

  it('前の試合の勝者を変えると、後の試合の記録は無効 (stale) になる', () => {
    const t = setup(4);
    t.bracket.matches['0-0'] = { a: 't1', b: 't4', games: [], override: 't1', note: '' };
    t.bracket.matches['0-1'] = { a: 't2', b: 't3', games: [], override: 't2', note: '' };
    t.bracket.matches['1-0'] = { a: 't1', b: 't2', games: [game('A'), game('A'), game('A')], override: null, note: '' };
    expect(champion(computeBracket(t))).toBe('t1');

    t.bracket.matches['0-1'].override = 't3';
    const rounds = computeBracket(t);
    expect(rounds[1][0].record).toBeNull();
    expect(rounds[1][0].stale).toBe(true);
    expect(champion(rounds)).toBeNull();
  });
});

describe('ブキ使用ルール', () => {
  function withGames(reuse: Tournament['rules']['reuse']) {
    const t = setup(4);
    t.rules.reuse = reuse;
    t.teams[0].pool = ['w1', 'w2', 'w3'];
    t.bracket.matches['0-0'] = {
      a: 't1',
      b: 't4',
      games: [game('A', 'w1', 'x'), game('A', 'w2', 'y')],
      override: null,
      note: '',
    };
    return t;
  }

  it('match: 同じ試合の他のゲームで使ったブキだけ使えない', () => {
    const t = withGames('match');
    const rounds = computeBracket(t);
    expect([...blockedWeapons(t, rounds, 't1', '0-0', 1)]).toEqual(['w1']);
    expect([...blockedWeapons(t, rounds, 't1', '1-0', 0)]).toEqual([]);
  });

  it('tournament: 大会中に使ったブキは全部使えない', () => {
    const t = withGames('tournament');
    const rounds = computeBracket(t);
    expect([...blockedWeapons(t, rounds, 't1', '1-0', 0)].sort()).toEqual(['w1', 'w2']);
    expect(poolStatus(t, rounds, 't1').map((s) => s.available)).toEqual([false, false, true]);
  });

  it('free: 制限なし', () => {
    const t = withGames('free');
    expect(blockedWeapons(t, computeBracket(t), 't1', '1-0', 0).size).toBe(0);
  });
});

describe('ブキ使用ルール (メイン単位)', () => {
  // ボールドマーカー系に登録し、1 戦目はボールドマーカー、2 戦目はわかばシューターを使用
  function withMainGames(reuse: Tournament['rules']['reuse']) {
    const t = setup(4);
    t.rules.poolUnit = 'main';
    t.rules.reuse = reuse;
    t.teams[0].pool = ['Shooter_Short', 'Shooter_First'];
    t.bracket.matches['0-0'] = {
      a: 't1',
      b: 't4',
      games: [game('A', 'Shooter_Short_00', ''), game('B', 'Shooter_First_00', '')],
      override: null,
      note: '',
    };
    return t;
  }

  it('マイナーチェンジに持ち替えても同じメインとして使用済みになる', () => {
    const t = withMainGames('match');
    const rounds = computeBracket(t);
    // 3 戦目: ボールドマーカーネオ (Shooter_Short_01) も使えない
    expect([...blockedWeapons(t, rounds, 't1', '0-0', 2)].sort()).toEqual(['Shooter_First', 'Shooter_Short']);
  });

  it('使用回数はメインごとに数える', () => {
    const t = withMainGames('tournament');
    t.bracket.matches['0-0'].games.push(game('A', 'Shooter_Short_01', ''));
    const rounds = computeBracket(t);
    expect(poolStatus(t, rounds, 't1')).toEqual([
      { weaponId: 'Shooter_Short', used: 2, available: false },
      { weaponId: 'Shooter_First', used: 1, available: false },
    ]);
  });
});
