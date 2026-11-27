// 選手ごとの集計 (大会成績・使用ブキ)。データが小さいのでブラウザ側で毎回計算する。

import type { AppData, GameMode, Tournament } from '../types';
import { computeBracket, sideId, type MatchView, type Placement } from './bracket';
import { allMatches, allPlacements } from './league';
import { allPicks, type PlayerPick } from './records';
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
  /** 勝敗が入力されているゲーム数 (勝率の分母) */
  decided: number;
}

export interface ModeStat {
  /** ルール (未入力は '') */
  mode: GameMode;
  games: number;
  wins: number;
  decided: number;
}

export interface PlayerStats {
  results: TournamentResult[];
  weapons: WeaponStat[];
  /** ルール別 (ナワバリ → エリア → ヤグラ → ホコ → アサリ → 未入力の順) */
  modes: ModeStat[];
  games: number;
  wins: number;
  /** 勝敗が入力されているゲーム数 (勝率の分母) */
  decided: number;
}

const MODE_ORDER: GameMode[] = ['ナワバリ', 'エリア', 'ヤグラ', 'ホコ', 'アサリ', ''];

/** 勝率 (0〜1)。勝敗の入力がなければ null */
export const winRate = (s: { wins: number; decided: number }): number | null => (s.decided ? s.wins / s.decided : null);

const roundsCache = new WeakMap<Tournament, MatchView[][]>();

/** 大会の本選トーナメント (計算結果を大会ごとに覚えておく) */
export function roundsOf(t: Tournament): MatchView[][] {
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
  const modes = new Map<GameMode, ModeStat>();
  let games = 0;
  let wins = 0;
  let decided = 0;

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
        // 勝敗が未入力のゲームは試合数には数えるが、勝率の分母には入れない
        const isDecided = g.winner !== null;
        const won = g.winner === side;
        games++;
        if (isDecided) decided++;
        if (won) wins++;
        const ms = modes.get(g.mode) ?? { mode: g.mode, games: 0, wins: 0, decided: 0 };
        ms.games++;
        if (isDecided) ms.decided++;
        if (won) ms.wins++;
        modes.set(g.mode, ms);
        if (!weaponId) continue;
        const s = weapons.get(weaponId) ?? { weaponId, games: 0, wins: 0, decided: 0 };
        s.games++;
        if (isDecided) s.decided++;
        if (won) s.wins++;
        weapons.set(weaponId, s);
      }
    }
  }

  return {
    results,
    weapons: [...weapons.values()].sort((a, b) => b.games - a.games || b.wins - a.wins),
    modes: MODE_ORDER.flatMap((m) => modes.get(m) ?? []),
    games,
    wins,
    decided,
  };
}

/** 確定した成績のうち最も良いもの */
export function bestPlacement(stats: PlayerStats): Placement | null {
  return stats.results.reduce<Placement | null>(
    (best, r) => (r.placement && (!best || r.placement.rank < best.rank) ? r.placement : best),
    null,
  );
}

/** すべての大会で記録された使用ブキ (大会をまたいだ通算の集計用) */
export function overallPicks(data: AppData): PlayerPick[] {
  return data.tournaments.flatMap((t) => allPicks(t, roundsOf(t)));
}
