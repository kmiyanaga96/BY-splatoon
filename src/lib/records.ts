// 選手ごとのブキ使用の記録と集計 (ADR 0002 段階 2)。
// 通常ルールの大会は選手ごとに入力したブキ (Game.picksA/B) を、ブキ統一杯はチームのブキを出場メンバー全員の使用として数える。

import { categoryOf } from '../data/weapons';
import type { Game, Team, Tournament } from '../types';
import { sideId, type MatchView } from './bracket';
import { lineupIds } from './roster';

/** 1 人が 1 ゲームで使ったブキ */
export interface PlayerPick {
  matchKey: string;
  round: number;
  matchIndex: number;
  gameIndex: number;
  teamId: string;
  opponentId: string;
  playerId: string;
  weaponId: string;
  /** 勝敗が未入力なら null */
  won: boolean | null;
}

/** そのゲームで各出場メンバーが使ったブキ (Player.id -> ブキ ID)。未入力の人は含めない */
export function gamePicks(team: Team | undefined, g: Game, side: 'A' | 'B'): Map<string, string> {
  const picks = side === 'A' ? g.picksA : g.picksB;
  const teamWeapon = side === 'A' ? g.weaponA : g.weaponB;
  const result = new Map<string, string>();
  for (const playerId of lineupIds(team, side === 'A' ? g.lineupA : g.lineupB)) {
    const weaponId = picks?.[playerId] || teamWeapon;
    if (weaponId) result.set(playerId, weaponId);
  }
  return result;
}

/** 大会で記録されたすべての使用ブキ (試合順) */
export function allPicks(t: Tournament, rounds: MatchView[][]): PlayerPick[] {
  const out: PlayerPick[] = [];
  for (const m of rounds.flat()) {
    if (!m.record) continue;
    const ids = { A: sideId(m.a), B: sideId(m.b) };
    m.record.games.forEach((g, gameIndex) => {
      for (const side of ['A', 'B'] as const) {
        const teamId = ids[side];
        if (!teamId) continue;
        const team = t.teams.find((x) => x.id === teamId);
        for (const [playerId, weaponId] of gamePicks(team, g, side)) {
          out.push({
            matchKey: m.key,
            round: m.round,
            matchIndex: m.index,
            gameIndex,
            teamId,
            opponentId: ids[side === 'A' ? 'B' : 'A'] ?? '',
            playerId,
            weaponId,
            won: g.winner ? g.winner === side : null,
          });
        }
      }
    });
  }
  return out;
}

export interface UsageRow {
  /** ブキ ID またはカテゴリ ID */
  id: string;
  uses: number;
  wins: number;
  /** 勝敗が入力されている使用数 (勝率の分母) */
  decided: number;
}

/** ブキ別・カテゴリ別の使用数と勝敗。使用数の多い順 */
export function usageBy(picks: PlayerPick[], by: 'weapon' | 'category'): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const p of picks) {
    const id = by === 'weapon' ? p.weaponId : (categoryOf(p.weaponId)?.id ?? '');
    if (!id) continue;
    const r = rows.get(id) ?? { id, uses: 0, wins: 0, decided: 0 };
    r.uses++;
    if (p.won !== null) r.decided++;
    if (p.won) r.wins++;
    rows.set(id, r);
  }
  return [...rows.values()].sort((a, b) => b.uses - a.uses || b.wins - a.wins);
}

/** 割合を「42%」の形に。分母が 0 なら「-」 */
export function percent(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : '-';
}
