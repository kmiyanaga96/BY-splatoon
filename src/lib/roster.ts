// チームのメンバー (所属) と選手 DB をつなぐ。

import type { Member, Player, PlayerMap, Team } from '../types';

export interface RosterEntry {
  member: Member;
  player: Player;
}

const missing = (id: string): Player => ({ id, name: '(削除された選手)', discord: '', xp: null, avatar: '', mains: [], note: '' });

export function roster(team: Team, players: PlayerMap): RosterEntry[] {
  return team.members.map((member) => ({ member, player: players.get(member.playerId) ?? missing(member.playerId) }));
}

/** ゲームの出場メンバー。lineup が null (未指定) ならチーム全員 */
export function lineupIds(team: Team | undefined, lineup: string[] | null): string[] {
  return lineup ?? team?.members.map((m) => m.playerId) ?? [];
}
