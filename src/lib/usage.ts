// ブキ統一杯の「どのチームがどのブキを使った/まだ使えるか」の計算。

import { unitKey } from '../data/weapons';
import type { Tournament } from '../types';
import { sideId, type MatchView } from './bracket';
import { allMatches } from './league';

export interface WeaponUse {
  /** 実際に使ったブキ */
  weaponId: string;
  matchKey: string;
  /** 試合の見出し (例: 準決勝 第1試合) */
  matchLabel: string;
  gameIndex: number;
  opponentId: string;
  won: boolean | null;
}

/** チームが記録上使ったブキの一覧 (予選リーグ → 本選トーナメントの試合順。使用制限は予選・本選を通算する) */
export function teamUses(t: Tournament, rounds: MatchView[][], teamId: string): WeaponUse[] {
  const uses: WeaponUse[] = [];
  for (const m of allMatches(t, rounds)) {
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
        matchLabel: m.label,
        gameIndex,
        opponentId: (isA ? sideId(m.b) : sideId(m.a)) ?? '',
        won: g.winner ? g.winner === (isA ? 'A' : 'B') : null,
      });
    });
  }
  return uses;
}

/** チームの使用回数 (key: 候補の単位にそろえたキー。メイン単位ならメイン ID) */
export function usageCounts(t: Tournament, rounds: MatchView[][], teamId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of teamUses(t, rounds, teamId)) {
    const key = unitKey(t.rules.poolUnit, u.weaponId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * ルール上、指定した試合・ゲームでそのチームが選べなくなっているもの。
 * キーは候補の単位にそろえる (メイン単位ならメイン ID。照合には unitKey を使う)。
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
    teamUses(t, rounds, teamId)
      .filter((u) => !(u.matchKey === matchKey && u.gameIndex === gameIndex))
      .filter((u) => rule === 'tournament' || u.matchKey === matchKey)
      .map((u) => unitKey(t.rules.poolUnit, u.weaponId)),
  );
}

export interface PoolStatus {
  /** 候補 (ブキ ID またはメイン ID) */
  weaponId: string;
  /** 何回使ったか */
  used: number;
  /** 大会通して再使用不可ルールでまだ使えるか */
  available: boolean;
}

export function poolStatus(t: Tournament, rounds: MatchView[][], teamId: string): PoolStatus[] {
  const team = t.teams.find((x) => x.id === teamId);
  if (!team) return [];
  const counts = usageCounts(t, rounds, teamId);
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
