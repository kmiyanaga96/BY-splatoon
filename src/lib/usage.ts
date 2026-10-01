// ブキ統一杯の「どのチームがどのブキを使った/まだ使えるか」の計算。

import type { Tournament } from '../types';
import { sideId, type MatchView } from './bracket';

export interface WeaponUse {
  weaponId: string;
  matchKey: string;
  gameIndex: number;
  opponentId: string;
  won: boolean | null;
}

/** チームが記録上使ったブキの一覧 (試合順) */
export function teamUses(rounds: MatchView[][], teamId: string): WeaponUse[] {
  const uses: WeaponUse[] = [];
  for (const round of rounds) {
    for (const m of round) {
      if (!m.record) continue;
      const isA = sideId(m.a) === teamId;
      const isB = sideId(m.b) === teamId;
      if (!isA && !isB) continue;
      m.record.games.forEach((g, gameIndex) => {
        const weaponId = isA ? g.weaponA : g.weaponB;
        if (!weaponId) return;
        uses.push({
          weaponId,
          matchKey: m.key,
          gameIndex,
          opponentId: (isA ? sideId(m.b) : sideId(m.a)) ?? '',
          won: g.winner ? g.winner === (isA ? 'A' : 'B') : null,
        });
      });
    }
  }
  return uses;
}

/**
 * ルール上、指定した試合・ゲームでそのチームが選べなくなっているブキ。
 * (そのゲーム自身で選択中のブキは含めない)
 */
export function blockedWeapons(
  t: Tournament,
  rounds: MatchView[][],
  teamId: string,
  matchKey: string,
  gameIndex: number,
): Set<string> {
  const rule = t.rules.reuse;
  if (rule === 'free') return new Set();
  return new Set(
    teamUses(rounds, teamId)
      .filter((u) => !(u.matchKey === matchKey && u.gameIndex === gameIndex))
      .filter((u) => rule === 'tournament' || u.matchKey === matchKey)
      .map((u) => u.weaponId),
  );
}

export interface PoolStatus {
  weaponId: string;
  /** 何回使ったか */
  used: number;
  /** 大会通して再使用不可ルールでまだ使えるか */
  available: boolean;
}

export function poolStatus(t: Tournament, rounds: MatchView[][], teamId: string): PoolStatus[] {
  const team = t.teams.find((x) => x.id === teamId);
  if (!team) return [];
  const counts = new Map<string, number>();
  for (const u of teamUses(rounds, teamId)) counts.set(u.weaponId, (counts.get(u.weaponId) ?? 0) + 1);
  return team.pool.map((weaponId) => {
    const used = counts.get(weaponId) ?? 0;
    return { weaponId, used, available: t.rules.reuse !== 'tournament' || used === 0 };
  });
}

/** 複数チームの候補に入っているブキ (weaponId -> teamIds) */
export function duplicatedPoolWeapons(t: Tournament): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const team of t.teams) {
    for (const w of team.pool) map.set(w, [...(map.get(w) ?? []), team.id]);
  }
  for (const [w, ids] of map) if (ids.length < 2) map.delete(w);
  return map;
}
