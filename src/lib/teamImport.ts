// 別の大会からチームを取り込む (チーム名・色・紹介文・メンバー、必要なら候補ブキ)。
// 選手は全大会で共通の選手 DB を参照するだけなので、アイコン・Xパワー・成績はそのまま引き継がれる。

import { convertPool, newId } from '../model';
import type { Team, Tournament } from '../types';
import { kindOf } from './kinds';

export interface ImportOptions {
  /** 候補ブキも引き継ぐ (取り込み先が候補ブキを使う大会のときだけ) */
  pool: boolean;
}

export interface ImportResult {
  /** 取り込んだチーム (取り込み先での新しい ID) */
  teams: Team[];
  /** すでに取り込み先のチームにいたため外した選手 */
  skippedPlayerIds: string[];
}

/**
 * source の teamIds のチームを target (下書き) の末尾に追加する。target を直接書き換える。
 * - 大会ごとの記録 (ランダムブキの抽選結果) は引き継がない
 * - 取り込み先ですでにどこかのチームにいる選手は外す (1 人が 2 チームに入らないように)
 * - 取り込み先が 1 グループのリーグ戦 (総当たり) なら、そのグループにも入れる
 */
export function importTeams(target: Tournament, source: Tournament, teamIds: string[], opts: ImportOptions): ImportResult {
  const taken = new Set(target.teams.flatMap((x) => x.members.map((m) => m.playerId)));
  const usePool = opts.pool && kindOf(target).hasPool;
  const skipped: string[] = [];
  const teams: Team[] = [];
  for (const src of source.teams.filter((x) => teamIds.includes(x.id))) {
    const members = src.members.filter((m) => {
      if (!taken.has(m.playerId)) return true;
      skipped.push(m.playerId);
      return false;
    });
    for (const m of members) taken.add(m.playerId);
    teams.push({
      id: newId(),
      name: src.name,
      color: src.color,
      comment: src.comment,
      members: members.map((m) => ({ ...m })),
      pool: usePool ? convertPool(src.pool, target.rules.poolUnit) : [],
      draws: {},
    });
  }
  target.teams.push(...teams);
  const groups = target.league?.groups;
  if (groups?.length === 1) groups[0].teamIds.push(...teams.map((x) => x.id));
  return { teams, skippedPlayerIds: skipped };
}
