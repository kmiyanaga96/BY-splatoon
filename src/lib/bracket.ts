// シングルエリミネーションのトーナメント計算。
// 保存するのは「1 回戦の枠」と「各試合の記録」だけで、2 回戦以降の対戦カードや
// 勝者は毎回ここで導出する (勝者を後から修正しても自動で整合が取れる)。

import type { Bracket, MatchRecord, Tournament } from '../types';

export type Side = { kind: 'team'; id: string } | { kind: 'bye' } | { kind: 'tbd' };

export interface MatchView {
  key: string;
  round: number;
  index: number;
  a: Side;
  b: Side;
  /** 現在の対戦カードと一致する記録 (なければ null) */
  record: MatchRecord | null;
  /** 記録はあるが対戦カードが変わったため無効になっているもの */
  stale: boolean;
  bestOf: number;
  winsA: number;
  winsB: number;
  winner: Side;
}

export const BYE: Side = { kind: 'bye' };
export const TBD: Side = { kind: 'tbd' };
export const teamSide = (id: string): Side => ({ kind: 'team', id });

export const matchKey = (round: number, index: number) => `${round}-${index}`;

export function sideId(s: Side): string | null {
  return s.kind === 'team' ? s.id : null;
}

/** n チームが入る最小の枠数 (2 の累乗、最低 2) */
export function bracketSizeFor(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/**
 * 標準的なシード順。size=8 なら [1,8,4,5,2,7,3,6]。
 * 上位シード同士が決勝まで当たらず、不戦勝は上位シードに割り当たる。
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

/** シード順に並んだチーム ID から 1 回戦の枠を作る */
export function createSlots(seededTeamIds: string[]): (string | null)[] {
  const size = bracketSizeFor(seededTeamIds.length);
  return seedOrder(size).map((seed) => seededTeamIds[seed - 1] ?? null);
}

export function roundCount(bracket: Bracket): number {
  return bracket.slots.length >= 2 ? Math.log2(bracket.slots.length) : 0;
}

export function roundName(round: number, total: number): string {
  const fromLast = total - 1 - round;
  if (fromLast === 0) return '決勝';
  if (fromLast === 1) return '準決勝';
  if (fromLast === 2) return '準々決勝';
  return `${round + 1}回戦`;
}

export const winsNeeded = (bestOf: number) => Math.floor(Math.max(1, bestOf) / 2) + 1;

function decide(a: Side, b: Side, record: MatchRecord | null, bestOf: number, winsA: number, winsB: number): Side {
  if (a.kind === 'tbd' || b.kind === 'tbd') return TBD;
  if (a.kind === 'bye') return b; // 両方不戦勝枠なら bye が勝ち上がる
  if (b.kind === 'bye') return a;
  if (record?.override === a.id) return a;
  if (record?.override === b.id) return b;
  const need = winsNeeded(bestOf);
  if (winsA >= need) return a;
  if (winsB >= need) return b;
  return TBD;
}

export function computeBracket(t: Tournament): MatchView[][] {
  const { bracket, rules } = t;
  const total = roundCount(bracket);
  const rounds: MatchView[][] = [];
  for (let r = 0; r < total; r++) {
    const count = bracket.slots.length >> (r + 1);
    const views: MatchView[] = [];
    for (let i = 0; i < count; i++) {
      const pick = (j: number): Side => {
        if (r > 0) return rounds[r - 1][j].winner;
        const id = bracket.slots[j];
        return id ? teamSide(id) : BYE;
      };
      const a = pick(2 * i);
      const b = pick(2 * i + 1);
      const key = matchKey(r, i);
      const raw = bracket.matches[key] ?? null;
      const valid = !!raw && a.kind === 'team' && b.kind === 'team' && raw.a === a.id && raw.b === b.id;
      const record = valid ? raw : null;
      const winsA = record?.games.filter((g) => g.winner === 'A').length ?? 0;
      const winsB = record?.games.filter((g) => g.winner === 'B').length ?? 0;
      const bestOf = r === total - 1 ? rules.finalBestOf : rules.bestOf;
      views.push({
        key,
        round: r,
        index: i,
        a,
        b,
        record,
        stale: !!raw && !valid && (raw.games.length > 0 || !!raw.override),
        bestOf,
        winsA,
        winsB,
        winner: decide(a, b, record, bestOf, winsA, winsB),
      });
    }
    rounds.push(views);
  }
  return rounds;
}

/** 実際に試合が行われる (両チームが確定している or 確定待ちの) 試合か */
export function isPlayable(m: MatchView): boolean {
  return m.a.kind !== 'bye' && m.b.kind !== 'bye';
}

export function champion(rounds: MatchView[][]): string | null {
  const last = rounds.at(-1)?.[0];
  return last ? sideId(last.winner) : null;
}

/** チームがまだ勝ち残っているか (敗退していなければ true) */
export function isAlive(rounds: MatchView[][], teamId: string): boolean {
  for (const round of rounds) {
    for (const m of round) {
      const ids = [sideId(m.a), sideId(m.b)];
      if (!ids.includes(teamId)) continue;
      const w = sideId(m.winner);
      if (m.winner.kind !== 'tbd' && w !== teamId) return false;
    }
  }
  return true;
}
