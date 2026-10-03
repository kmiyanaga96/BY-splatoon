// 選手ごとの集計 (大会成績・使用ブキ)。データが小さいのでブラウザ側で毎回計算する。

import type { AppData, Tournament } from '../types';
import { computeBracket, sideId, type MatchView, type Placement } from './bracket';
import { allMatches, allPlacements } from './league';
import { lineupIds } from './roster';

export interface TournamentResult {
  tournament: Tournament;
  teamId: string;
  teamName: string;
  teamColor: string;
  /** 確定していなければ null */
  placement: Placement | null;
}

export interface WeaponStat {
  weaponId: string;
  games: number;
  wins: number;
}

export interface PlayerStats {
  results: TournamentResult[];
  weapons: WeaponStat[];
  games: number;
  wins: number;
}

const roundsCache = new WeakMap<Tournament, MatchView[][]>();

function roundsOf(t: Tournament): MatchView[][] {
  let r = roundsCache.get(t);
  if (!r) {
    r = computeBracket(t);
    roundsCache.set(t, r);
  }
  return r;
}

/** 大会は新しい順 (配列の後ろほど新しい) に並べて返す */
export function playerStats(data: AppData, playerId: string): PlayerStats {
  const results: TournamentResult[] = [];
  const weapons = new Map<string, WeaponStat>();
  let games = 0;
  let wins = 0;

  for (const t of [...data.tournaments].reverse()) {
    const team = t.teams.find((x) => x.members.some((m) => m.playerId === playerId));
    if (!team) continue;
    const rounds = roundsOf(t);
    results.push({
      tournament: t,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      placement: allPlacements(t, rounds).get(team.id) ?? null,
    });
    for (const m of allMatches(t, rounds)) {
      if (!m.record) continue;
      const side = sideId(m.a) === team.id ? 'A' : sideId(m.b) === team.id ? 'B' : null;
      if (!side) continue;
      for (const g of m.record.games) {
        const lineup = side === 'A' ? g.lineupA : g.lineupB;
        if (!lineupIds(team, lineup).includes(playerId)) continue;
        // 選手ごとの記録 (通常ルール) があればそれを、なければチームのブキを使う
        const weaponId = (side === 'A' ? g.picksA : g.picksB)?.[playerId] || (side === 'A' ? g.weaponA : g.weaponB);
        const won = g.winner === side;
        games++;
        if (won) wins++;
        if (!weaponId) continue;
        const s = weapons.get(weaponId) ?? { weaponId, games: 0, wins: 0 };
        s.games++;
        if (won) s.wins++;
        weapons.set(weaponId, s);
      }
    }
  }

  return {
    results,
    weapons: [...weapons.values()].sort((a, b) => b.games - a.games || b.wins - a.wins),
    games,
    wins,
  };
}

/** 確定した成績のうち最も良いもの */
export function bestPlacement(stats: PlayerStats): Placement | null {
  return stats.results.reduce<Placement | null>(
    (best, r) => (r.placement && (!best || r.placement.rank < best.rank) ? r.placement : best),
    null,
  );
}
