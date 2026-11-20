// 選手の優勝・準優勝の戦績 (表彰画像の金星・銀星)。
// ツールで記録した大会の分は成績から自動で一覧にし、ツールの外の大会の分は選手に手で登録したもの (Player.titles) を足す。
// どの戦績を星にするかは選手ごとに運営が選ぶ (Player.starTitles)。

import type { AppData, Player } from '../types';
import { allPlacements } from './league';
import { roundsOf } from './stats';

export interface TitleEntry {
  /** 星にするかどうかの記録に使うキー ("t:<大会ID>" / "m:<手で登録した戦績の ID>") */
  key: string;
  /** 大会名 */
  name: string;
  date: string;
  rank: 1 | 2;
  /** auto = ツールの大会の成績から / manual = 手で登録 */
  source: 'auto' | 'manual';
  /** 手で登録した戦績の ID (削除用) */
  manualId?: string;
  /** 星にするよう選ばれているか */
  starred: boolean;
}

export interface TitleSummary {
  /** 星にする優勝 (金星) の数 */
  gold: number;
  /** 星にする準優勝 (銀星) の数 */
  silver: number;
  /** すべての戦績 (星にしないものも含む)。自動 → 手動の順 (自動は新しい大会から) */
  entries: TitleEntry[];
}

export const autoTitleKey = (tournamentId: string) => `t:${tournamentId}`;
export const manualTitleKey = (titleId: string) => `m:${titleId}`;

/**
 * 選手の優勝・準優勝の戦績と、そのうち星にするものの数。すべての大会が対象。
 * exclude に大会 ID を渡すと、その大会は数えない (表彰画像では「過去の戦績」として表示中の大会を除く)。
 */
export function playerTitles(data: AppData, player: Player, exclude?: string): TitleSummary {
  const starred = new Set(player.starTitles);
  const entries: TitleEntry[] = [];
  for (const t of [...data.tournaments].reverse()) {
    if (t.id === exclude) continue;
    const team = t.teams.find((x) => x.members.some((m) => m.playerId === player.id));
    if (!team) continue;
    const label = allPlacements(t, roundsOf(t)).get(team.id)?.label;
    if (label !== '優勝' && label !== '準優勝') continue;
    const key = autoTitleKey(t.id);
    entries.push({ key, name: t.name, date: t.date, rank: label === '優勝' ? 1 : 2, source: 'auto', starred: starred.has(key) });
  }
  for (const x of player.titles) {
    const key = manualTitleKey(x.id);
    entries.push({ key, name: x.name, date: x.date, rank: x.rank, source: 'manual', manualId: x.id, starred: starred.has(key) });
  }
  return {
    gold: entries.filter((e) => e.starred && e.rank === 1).length,
    silver: entries.filter((e) => e.starred && e.rank === 2).length,
    entries,
  };
}
