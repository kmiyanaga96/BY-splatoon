import { describe, expect, it } from 'vitest';
import { newGame, newLeague, newPlayer, newTournament, normalizePlayer } from '../model';
import type { AppData, Game, Tournament } from '../types';
import { computeLeague } from './league';
import { autoTitleKey, manualTitleKey, playerTitles } from './titles';

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
  const [first, second] = data.tournaments;

  it('ツールの大会の優勝・準優勝は自動で一覧に出るが、星にするのは選んだものだけ', () => {
    const none = playerTitles(data, p1);
    expect(none).toMatchObject({ gold: 0, silver: 0 });
    expect(none.entries.map((e) => [e.name, e.starred])).toEqual([
      ['第2回', false],
      ['第1回', false],
    ]);
    const some = playerTitles(data, { ...p1, starTitles: [autoTitleKey(first.id)] });
    expect(some).toMatchObject({ gold: 1, silver: 0 });
  });

  it('手で登録した戦績も、選んだものだけ星にする', () => {
    const p = { ...p2, starTitles: [manualTitleKey('x'), autoTitleKey(second.id)] };
    const r = playerTitles(data, p);
    expect(r).toMatchObject({ gold: 1, silver: 1 });
    expect(r.entries.at(-1)).toMatchObject({ name: '昔の大会', date: '2025/8', rank: 1, source: 'manual', manualId: 'x', starred: true });
  });

  it('表示中の大会は数えないようにできる', () => {
    const p = { ...p1, starTitles: [autoTitleKey(first.id), autoTitleKey(second.id)] };
    expect(playerTitles(data, p).gold).toBe(2);
    expect(playerTitles(data, p, second.id).gold).toBe(1);
  });

  it('結果が確定していない大会・出場していない大会は一覧に出さない', () => {
    const t = finished('第3回');
    t.league!.matches = {};
    const p3 = newPlayer('クマ');
    expect(playerTitles({ ...data, tournaments: [t] }, p1).entries).toEqual([]);
    expect(playerTitles(data, p3).entries).toEqual([]);
  });

  it('星を選ぶ仕組みより前のデータ (starTitles なし) は、手で登録した戦績を星にしたまま読み込む', () => {
    const old = normalizePlayer({ id: 'p9', name: 'ブリ', titles: [{ id: 'a', name: '昔', rank: 2 }] });
    expect(old.starTitles).toEqual(['m:a']);
    expect(normalizePlayer({ id: 'p9', name: 'ブリ', titles: [{ id: 'a', name: '昔', rank: 2 }], starTitles: [] }).starTitles).toEqual([]);
  });
});
