// 予選リーグ (グループごとの総当たり) の計算 (ADR 0002 段階 3)。
// 保存するのは「グループ分け」と「各試合の記録」だけで、対戦表・順位は毎回ここで導出する。
// 試合はトーナメントと同じ MatchView で表すので、試合記録画面・ブキ使用制限・記録の集計をそのまま使える。

import type { LeagueGroup, Tiebreaker, Tournament } from '../types';
import { createSlots, decide, placements, sideId, teamSide, type MatchView, type Placement } from './bracket';

export interface StandingRow {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  /** 順位 (同順位あり) */
  rank: number;
}

export interface GroupView {
  group: LeagueGroup;
  /** 節ごとの試合 */
  rounds: MatchView[][];
  matches: MatchView[];
  /** 順位順 */
  standings: StandingRow[];
  /** 全試合の勝敗が決まったか */
  complete: boolean;
}

export const TIEBREAKER_LABEL: Record<Tiebreaker, string> = {
  wins: '勝ち数',
  gameDiff: 'ゲーム得失差',
  gamesWon: 'ゲーム取得数',
  headToHead: '直接対決',
};

export const leagueKey = (groupId: string, a: string, b: string) => `L:${groupId}:${a}:${b}`;

/** 総当たりの対戦表 (サークル方式)。奇数チームなら毎節 1 チームが休み */
export function roundRobin(ids: string[]): [string, string][][] {
  if (ids.length < 2) return [];
  const list: (string | null)[] = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 && i === 0 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    // 先頭を固定して残りを 1 つずつ回す
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export function computeLeague(t: Tournament): GroupView[] {
  const league = t.league;
  if (!league) return [];
  // グループ × 総当たりで数十試合程度なので、キャッシュせず毎回計算する
  return league.groups.map((group) => {
    const rounds = roundRobin(group.teamIds).map((pairs, r) =>
      pairs.map(([a, b], i): MatchView => {
        const key = leagueKey(group.id, a, b);
        const raw = league.matches[key] ?? null;
        const record = raw && raw.a === a && raw.b === b ? raw : null;
        const winsA = record?.games.filter((g) => g.winner === 'A').length ?? 0;
        const winsB = record?.games.filter((g) => g.winner === 'B').length ?? 0;
        return {
          key,
          stage: 'league',
          label: `${group.name} 第${r + 1}節`,
          round: r,
          index: i,
          a: teamSide(a),
          b: teamSide(b),
          record,
          stale: false,
          bestOf: league.bestOf,
          winsA,
          winsB,
          winner: decide(teamSide(a), teamSide(b), record, league.bestOf, winsA, winsB),
        };
      }),
    );
    const matches = rounds.flat();
    return {
      group,
      rounds,
      matches,
      standings: standings(group.teamIds, matches, league.tiebreakers),
      complete: matches.every((m) => m.winner.kind === 'team'),
    };
  });
}

function standings(teamIds: string[], matches: MatchView[], tiebreakers: Tiebreaker[]): StandingRow[] {
  const rows = new Map(teamIds.map((teamId) => [teamId, { teamId, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, rank: 0 }]));
  const decided = matches.filter((m) => m.winner.kind === 'team');
  for (const m of decided) {
    const a = rows.get(sideId(m.a)!)!;
    const b = rows.get(sideId(m.b)!)!;
    const aWon = sideId(m.winner) === a.teamId;
    a.played++;
    b.played++;
    (aWon ? a : b).wins++;
    (aWon ? b : a).losses++;
    a.gamesWon += m.winsA;
    a.gamesLost += m.winsB;
    b.gamesWon += m.winsB;
    b.gamesLost += m.winsA;
  }
  const ordered = rankGroups([...rows.values()], tiebreakers, decided);
  const result: StandingRow[] = [];
  for (const tie of ordered) {
    const rank = result.length + 1;
    for (const r of tie) result.push({ ...r, rank });
  }
  return result;
}

/** 決め方を上から順に適用して、同順位のまとまりを順に返す。最後まで並んだチームは元の並び (シード順) のまま同順位 */
function rankGroups(rows: StandingRow[], keys: Tiebreaker[], decided: MatchView[]): StandingRow[][] {
  if (rows.length <= 1 || keys.length === 0) return [rows];
  const [key, ...rest] = keys;
  const tied = new Set(rows.map((r) => r.teamId));
  const value = (r: StandingRow): number => {
    switch (key) {
      case 'wins':
        return r.wins;
      case 'gameDiff':
        return r.gamesWon - r.gamesLost;
      case 'gamesWon':
        return r.gamesWon;
      case 'headToHead':
        // 並んでいるチーム同士の試合だけで数えた勝ち数
        return decided.filter((m) => tied.has(sideId(m.a)!) && tied.has(sideId(m.b)!) && sideId(m.winner) === r.teamId).length;
    }
  };
  const values = new Map(rows.map((r) => [r.teamId, value(r)]));
  const sorted = [...rows].sort((a, b) => values.get(b.teamId)! - values.get(a.teamId)!);
  const out: StandingRow[][] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || values.get(sorted[i].teamId) !== values.get(sorted[start].teamId)) {
      const tie = sorted.slice(start, i);
      // 1 つの決め方で差がつかなかったときだけ次の決め方へ (全員同じなら次へ進めないと無限に回る)
      out.push(...(tie.length === rows.length ? rankGroups(tie, rest, decided) : rankGroups(tie, keys, decided)));
      start = i;
    }
  }
  return out;
}

/** 本選に進むチーム数ちょうどの位置で同順位が並んでいるか (運営が手で決める必要がある) */
export function tieAtCutoff(g: GroupView, advance: number): boolean {
  const last = g.standings[advance - 1];
  const next = g.standings[advance];
  return !!last && !!next && last.rank === next.rank;
}

/**
 * 予選の順位から本選のシード順を作る。各順位のまとまり (全グループの 1 位、全グループの 2 位 …) を順に並べ、
 * 2 つ目以降のまとまりは、1 回戦で同じグループのチームが当たる組が一番少なくなる並びを選ぶ (たすき掛け)。
 */
export function seedsFromLeague(groups: GroupView[], advance: number): string[] {
  const groupOf = new Map(groups.flatMap((g) => g.group.teamIds.map((id) => [id, g.group.id] as const)));
  const conflicts = (seeds: string[]) => {
    const slots = createSlots(seeds);
    let n = 0;
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i];
      const b = slots[i + 1];
      if (a && b && groupOf.get(a) === groupOf.get(b)) n++;
    }
    return n;
  };
  let seeds: string[] = [];
  for (let p = 0; p < advance; p++) {
    const block = groups.map((g) => g.standings[p]?.teamId).filter((x): x is string => !!x);
    if (p === 0) {
      seeds = block;
      continue;
    }
    const candidates: string[][] = [];
    for (let k = 0; k < block.length; k++) {
      const rotated = [...block.slice(k), ...block.slice(0, k)];
      candidates.push(rotated, [...rotated].reverse());
    }
    seeds = [...seeds, ...candidates.reduce((best, c) => (conflicts([...seeds, ...c]) < conflicts([...seeds, ...best]) ? c : best))];
  }
  return seeds;
}

/** 予選リーグと本選トーナメントのすべての試合 (予選が先) */
export function allMatches(t: Tournament, rounds: MatchView[][]): MatchView[] {
  return [...computeLeague(t).flatMap((g) => g.matches), ...rounds.flat()];
}

export const LEAGUE_OUT: Placement = { rank: 999, label: '予選敗退' };

/** 確定した成績。本選の成績に加えて、本選を作ったあとの予選敗退チーム */
export function allPlacements(t: Tournament, rounds: MatchView[][]): Map<string, Placement> {
  const result = placements(rounds);
  if (t.league && t.bracket.slots.length) {
    const inBracket = new Set(t.bracket.slots.filter(Boolean));
    for (const g of t.league.groups) for (const id of g.teamIds) if (!inBracket.has(id)) result.set(id, LEAGUE_OUT);
  }
  return result;
}
