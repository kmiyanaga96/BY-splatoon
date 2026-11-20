// 選手の優勝・準優勝の戦績 (表彰画像の金星・銀星)。
// ツールで記録した大会の分は成績から自動で数え、ツールの外の大会の分は選手に手で登録したもの (Player.titles) を足す。

import type { AppData, Player } from '../types';
import { allPlacements } from './league';
import { roundsOf } from './stats';

export interface TitleEntry {
  /** 大会名 */
  name: string;
  date: string;
  rank: 1 | 2;
  /** auto = ツールの大会の成績から / manual = 手で登録 */
  source: 'auto' | 'manual';
}

export interface TitleSummary {
  gold: number;
  silver: number;
  /** 自動 → 手動の順 (自動は新しい大会から) */
  entries: TitleEntry[];
}

/**
 * 選手の優勝 (金星)・準優勝 (銀星) の数。すべての大会が対象。
 * exclude に大会 ID を渡すと、その大会は数えない (表彰画像では「過去の戦績」として表示中の大会を除く)。
 */
export function playerTitles(data: AppData, player: Player, exclude?: string): TitleSummary {
  const entries: TitleEntry[] = [];
  for (const t of [...data.tournaments].reverse()) {
    if (t.id === exclude) continue;
    const team = t.teams.find((x) => x.members.some((m) => m.playerId === player.id));
    if (!team) continue;
    const label = allPlacements(t, roundsOf(t)).get(team.id)?.label;
    if (label === '優勝' || label === '準優勝') entries.push({ name: t.name, date: t.date, rank: label === '優勝' ? 1 : 2, source: 'auto' });
  }
  for (const x of player.titles) entries.push({ name: x.name, date: x.date, rank: x.rank, source: 'manual' });
  return {
    gold: entries.filter((e) => e.rank === 1).length,
    silver: entries.filter((e) => e.rank === 2).length,
    entries,
  };
}
