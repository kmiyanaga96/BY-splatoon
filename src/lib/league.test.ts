import { describe, expect, it } from 'vitest';
import { applyScore, makeGroups, newGame, newLeague, newTournament, normalizeData } from '../model';
import type { Game, Tournament } from '../types';
import { computeBracket, createSlots } from './bracket';
import { allPlacements, computeLeague, leagueKey, roundRobin, seedsFromLeague, tieAtCutoff } from './league';
import { blockedWeapons } from './usage';

const win = (winner: 'A' | 'B', weaponA = ''): Game => ({ ...newGame(), winner, weaponA });

function setup(teamCount: number, groupCount: number): Tournament {
  const t = newTournament();
  t.teams = Array.from({ length: teamCount }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    color: '',
    comment: '',
    members: [],
    pool: [],
    draws: {},
  }));
  t.league = newLeague(
    t.teams.map((x) => x.id),
    groupCount,
  );
  return t;
}

/** a と b の試合を記録する (BO3 を 2-0 / 2-1 で) */
function play(t: Tournament, a: string, b: string, winsA: number, winsB: number) {
  const g = computeLeague(t)
    .flatMap((x) => x.matches)
    .find((m) => [m.a, m.b].every((s) => s.kind === 'team' && [a, b].includes(s.id)))!;
  const aIsA = g.a.kind === 'team' && g.a.id === a;
  const games = [...Array(winsA).fill(aIsA ? 'A' : 'B'), ...Array(winsB).fill(aIsA ? 'B' : 'A')].map((w) => win(w));
  t.league!.matches[g.key] = { a: aIsA ? a : b, b: aIsA ? b : a, games, override: null, note: '' };
}

describe('総当たりの対戦表', () => {
  it('全組み合わせがちょうど 1 回ずつ、毎節同じチームは 1 試合まで', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      const rounds = roundRobin(ids);
      const pairs = rounds.flat().map((p) => [...p].sort().join('-'));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      expect(pairs.length).toBe((n * (n - 1)) / 2);
      for (const r of rounds) expect(new Set(r.flat()).size).toBe(r.length * 2);
    }
  });

  it('グループはシード順にジグザグで振り分ける', () => {
    expect(makeGroups(['1', '2', '3', '4', '5', '6', '7', '8'], 2).map((g) => g.teamIds)).toEqual([
      ['1', '4', '5', '8'],
      ['2', '3', '6', '7'],
    ]);
  });
});

describe('順位表', () => {
  it('勝ち数 → ゲーム得失差の順で並べる', () => {
    const t = setup(4, 1);
    t.league!.tiebreakers = ['wins', 'gameDiff'];
    play(t, 't1', 't2', 2, 0);
    play(t, 't1', 't3', 0, 2);
    play(t, 't1', 't4', 2, 1);
    play(t, 't2', 't3', 2, 1);
    play(t, 't2', 't4', 2, 0);
    play(t, 't3', 't4', 2, 0);
    const [g] = computeLeague(t);
    // t1: 2勝 (4-3) / t2: 2勝 (4-3) / t3: 2勝 (5-2) / t4: 0勝
    expect(g.standings.map((r) => [r.teamId, r.wins, r.rank])).toEqual([
      ['t3', 2, 1],
      ['t1', 2, 2],
      ['t2', 2, 2],
      ['t4', 0, 4],
    ]);
    expect(g.complete).toBe(true);
    expect(tieAtCutoff(g, 2)).toBe(true);
    expect(tieAtCutoff(g, 3)).toBe(false);
  });

  it('既定の決め方では、得失差でも並んだら直接対決で決める', () => {
    const t = setup(4, 1);
    play(t, 't1', 't2', 2, 0);
    play(t, 't1', 't3', 0, 2);
    play(t, 't1', 't4', 2, 1);
    play(t, 't2', 't3', 2, 1);
    play(t, 't2', 't4', 2, 0);
    play(t, 't3', 't4', 2, 0);
    expect(computeLeague(t)[0].standings.map((r) => [r.teamId, r.rank])).toEqual([
      ['t3', 1],
      ['t1', 2],
      ['t2', 3],
      ['t4', 4],
    ]);
  });

  it('直接対決は並んだチーム同士の試合だけで比べる', () => {
    const t = setup(4, 1);
    t.league!.tiebreakers = ['wins', 'headToHead'];
    play(t, 't1', 't2', 2, 0);
    play(t, 't1', 't3', 0, 2);
    play(t, 't1', 't4', 2, 0);
    play(t, 't2', 't3', 2, 0);
    play(t, 't2', 't4', 2, 0);
    play(t, 't3', 't4', 2, 0);
    // 3 チームが 2 勝で並び、直接対決も 1 勝ずつ → 同順位
    expect(computeLeague(t)[0].standings.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it('記録の対戦カードが変わった試合は数えない', () => {
    const t = setup(2, 1);
    const key = leagueKey('A', 't1', 't2');
    t.league!.matches[key] = { a: 't2', b: 't1', games: [win('A'), win('A')], override: null, note: '' };
    expect(computeLeague(t)[0].standings.every((r) => r.played === 0)).toBe(true);
  });
});

describe('本選への進出', () => {
  it('別グループの 1 位と 2 位が当たるように並べる', () => {
    const t = setup(8, 2);
    const groups = computeLeague(t);
    const seeds = seedsFromLeague(groups, 2);
    const slots = createSlots(seeds);
    const groupOf = (id: string | null) => groups.find((g) => g.group.teamIds.includes(id!))?.group.id;
    for (let i = 0; i < slots.length; i += 2) expect(groupOf(slots[i])).not.toBe(groupOf(slots[i + 1]));
  });

  it('4 グループでも 1 回戦で同じグループ同士が当たらない', () => {
    const t = setup(16, 4);
    const groups = computeLeague(t);
    const slots = createSlots(seedsFromLeague(groups, 2));
    const groupOf = (id: string | null) => groups.find((g) => g.group.teamIds.includes(id!))?.group.id;
    for (let i = 0; i < slots.length; i += 2) expect(groupOf(slots[i])).not.toBe(groupOf(slots[i + 1]));
  });

  it('本選を作ったら、入っていないチームは予選敗退', () => {
    const t = setup(4, 2);
    t.bracket.slots = createSlots(['t1', 't2']);
    const places = allPlacements(t, computeBracket(t));
    expect(places.get('t3')?.label).toBe('予選敗退');
    expect(places.has('t1')).toBe(false);
  });
});

describe('ブキの使用制限は予選と本選を通算する', () => {
  it('予選で使ったブキは本選でも使用済み (大会を通して再使用不可)', () => {
    const t = setup(4, 1);
    t.rules.reuse = 'tournament';
    t.rules.poolUnit = 'weapon';
    const g = computeLeague(t)[0].matches.find((m) => m.a.kind === 'team' && m.a.id === 't1')!;
    t.league!.matches[g.key] = { a: 't1', b: (g.b as { id: string }).id, games: [win('A', 'Shooter_Short_00')], override: null, note: '' };
    t.bracket.slots = createSlots(['t1', 't2']);
    expect([...blockedWeapons(t, computeBracket(t), 't1', '0-0', 0)]).toEqual(['Shooter_Short_00']);
  });
});

describe('読み込み', () => {
  it('予選のない旧データは league: null、存在しないチームと重複所属は外す', () => {
    const d = normalizeData({
      tournaments: [
        { id: 'x', teams: [{ id: 'a' }] },
        { id: 'y', teams: [{ id: 'a' }, { id: 'b' }], league: { groups: [{ id: 'A', teamIds: ['a', 'zz'] }, { id: 'B', teamIds: ['a', 'b'] }], tiebreakers: ['wins', 'bogus'] } },
      ],
    });
    expect(d.tournaments[0].league).toBeNull();
    const l = d.tournaments[1].league!;
    expect(l.groups.map((g) => g.teamIds)).toEqual([['a'], ['b']]);
    expect(l.tiebreakers).toEqual(['wins']);
    expect(l.advance).toBe(2);
  });
});

describe('タイカイサポートの優先勝利条件 (新しい予選の既定)', () => {
  it('勝利試合数 → 勝利バトル数 → 負けバトル数の少なさ → 直接対決 → エントリー番号順', () => {
    const t = setup(4, 1);
    expect(t.league!.tiebreakers).toEqual(['wins', 'gamesWon', 'gamesLost', 'headToHead', 'entry']);
    play(t, 't1', 't2', 2, 1); // t1 勝
    play(t, 't3', 't4', 2, 0); // t3 勝
    play(t, 't1', 't3', 0, 2); // t3 勝
    play(t, 't2', 't4', 2, 0); // t2 勝
    play(t, 't1', 't4', 2, 0); // t1 勝
    play(t, 't2', 't3', 2, 1); // t2 勝
    // t1: 2勝 4-3 / t2: 2勝 5-3 / t3: 2勝 5-2 / t4: 0勝
    // 勝利バトル数で t2・t3 (5) > t1 (4)、負けバトル数の少なさで t3 (2) > t2 (3)
    expect(computeLeague(t)[0].standings.map((r) => [r.teamId, r.rank])).toEqual([
      ['t3', 1],
      ['t2', 2],
      ['t1', 3],
      ['t4', 4],
    ]);
  });

  it('最後はエントリー番号順で決まり、同順位は出ない', () => {
    const t = setup(4, 1);
    play(t, 't1', 't2', 2, 0);
    play(t, 't1', 't3', 0, 2);
    play(t, 't1', 't4', 2, 0);
    play(t, 't2', 't3', 2, 0);
    play(t, 't2', 't4', 2, 0);
    play(t, 't3', 't4', 2, 0);
    // t1・t2・t3 が 2勝 4-2 で並び、直接対決も 1 勝ずつ → チーム一覧の順
    expect(computeLeague(t)[0].standings.map((r) => [r.teamId, r.rank])).toEqual([
      ['t1', 1],
      ['t2', 2],
      ['t3', 3],
      ['t4', 4],
    ]);
  });
});

describe('勝利本数の直接入力', () => {
  const winners = (gs: Game[]) => gs.map((g) => g.winner).join('');

  it('空の記録から勝ち数どおりのゲームを作る', () => {
    expect(winners(applyScore([], 2, 1))).toBe('AAB');
  });

  it('勝敗未入力のゲームを先に埋め、記録のあるゲームは残す', () => {
    const gs = [{ ...win('B'), weaponA: 'Shooter_Short_00' }, { ...newGame(), stage: 'ユノハナ大渓谷' }];
    const out = applyScore(gs, 2, 1);
    expect(winners(out)).toBe('BAA');
    expect(out[0].weaponA).toBe('Shooter_Short_00');
    expect(out[1].stage).toBe('ユノハナ大渓谷');
  });

  it('勝ちを減らすと、記録のないゲームは消し、記録のあるゲームは勝敗だけ外す', () => {
    const gs = [win('A'), { ...win('A'), weaponA: 'Shooter_Short_00' }, win('A')];
    const out = applyScore(gs, 1, 0);
    expect(out.map((g) => g.winner)).toEqual(['A', null]);
    expect(out[1].weaponA).toBe('Shooter_Short_00');
  });
});
