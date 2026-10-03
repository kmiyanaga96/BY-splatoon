// Discord に貼り付ける告知文の生成。Discord の Markdown (太字・見出し・引用) を使う。

import type { PlayerMap, Team, Tournament } from '../types';
import { weaponName } from '../data/weapons';
import { champion, isPlayable, roundName, sideId, winsNeeded, type MatchView } from './bracket';
import { poolStatus, teamUses } from './usage';
import { roster } from './roster';

export const DISCORD_LIMIT = 2000;

const REUSE_TEXT = {
  free: '同じブキを何度でも使用可能',
  match: '同じ試合(セット)内では同じブキを再使用不可',
  tournament: '大会を通して一度使ったブキは再使用不可',
} as const;

/** メイン単位では「同じメイン」の再使用を制限する */
const REUSE_TEXT_MAIN = {
  free: '同じメインを何度でも使用可能',
  match: '同じ試合(セット)内では同じメインを再使用不可（マイナーチェンジに持ち替えても不可）',
  tournament: '大会を通して一度使ったメインは再使用不可（マイナーチェンジに持ち替えても不可）',
} as const;

function teamName(t: Tournament, id: string | null): string {
  if (!id) return '未定';
  return t.teams.find((x) => x.id === id)?.name ?? '不明なチーム';
}

function sideLabel(t: Tournament, m: MatchView, which: 'a' | 'b'): string {
  const s = m[which];
  if (s.kind === 'bye') return '不戦勝';
  if (s.kind === 'tbd') return '未定';
  return teamName(t, s.id);
}

export function rulesText(t: Tournament): string {
  const r = t.rules;
  const lines = [
    r.poolUnit === 'main'
      ? `・1チーム ${r.teamSize} 人、チーム全員が同じメインのブキを使用（マイナーチェンジは混在可）`
      : `・1チーム ${r.teamSize} 人、チーム全員が同じブキを使用`,
    r.poolUnit === 'main'
      ? `・候補ブキはメインを ${r.poolMax > 0 ? `${r.poolMax} 種まで` : '制限なし'}で事前登録（同じメインのマイナーチェンジはどれでも使用可）`
      : `・候補ブキは ${r.poolMax > 0 ? `最大 ${r.poolMax} 種` : '制限なし'}で事前登録`,
    `・${(r.poolUnit === 'main' ? REUSE_TEXT_MAIN : REUSE_TEXT)[r.reuse]}`,
    r.allowDuplicate ? null : `・他チームと同じ候補${r.poolUnit === 'main' ? 'メイン' : 'ブキ'}は登録不可`,
    `・各試合 BO${r.bestOf}（${winsNeeded(r.bestOf)}勝先取）、決勝は BO${r.finalBestOf}（${winsNeeded(r.finalBestOf)}勝先取）`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function overviewText(t: Tournament): string {
  const parts = [`# ${t.name}`];
  if (t.date) parts.push(`📅 **日時**: ${t.date}`);
  if (t.description) parts.push(t.description);
  parts.push(`## ルール\n${rulesText(t)}`);
  if (t.teams.length) {
    parts.push(`## 参加チーム (${t.teams.length})\n${t.teams.map((x) => `・${x.name}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

export function teamText(t: Tournament, team: Team, players: PlayerMap, rounds?: MatchView[][]): string {
  const lines = [`## ${team.name}`];
  if (team.comment) lines.push(`> ${team.comment.replace(/\n/g, '\n> ')}`);
  const status = rounds ? poolStatus(t, rounds, team.id) : null;
  if (team.pool.length) {
    const pool = team.pool.map((w) => {
      const s = status?.find((x) => x.weaponId === w);
      if (s && t.rules.reuse === 'tournament' && !s.available) return `~~${weaponName(w)}~~`;
      return weaponName(w);
    });
    lines.push(`🔫 **候補ブキ**: ${pool.join(' / ')}`);
  }
  const members = roster(team, players);
  if (members.length) {
    lines.push('👥 **メンバー**');
    for (const { member: m, player: p } of members) {
      const marks = `${m.leader ? '👑' : ''}${m.featured ? '⭐' : ''}`;
      const mains = p.mains.length ? `（${p.mains.map(weaponName).join('・')}）` : '';
      lines.push(`・${marks}${p.name || '(名前未入力)'}${mains}${p.xp ? ` XP${p.xp}` : ''}${p.note ? ` ${p.note}` : ''}`);
    }
  }
  for (const { member: m, player: p } of members.filter((x) => x.member.featured && x.member.comment)) {
    lines.push(`⭐ **注目選手 ${p.name}**: ${m.comment}`);
  }
  return lines.join('\n');
}

export function allTeamsText(t: Tournament, players: PlayerMap, rounds?: MatchView[][]): string {
  return [`# ${t.name} 参加チーム紹介`, ...t.teams.map((team) => teamText(t, team, players, rounds))].join('\n\n');
}

export function featuredText(t: Tournament, players: PlayerMap): string {
  const lines = [`# ${t.name} 注目選手`];
  for (const team of t.teams) {
    for (const { member: m, player: p } of roster(team, players).filter((x) => x.member.featured)) {
      const mains = p.mains.length ? `（${p.mains.map(weaponName).join('・')}）` : '';
      lines.push(`⭐ **${p.name}** [${team.name}]${mains}${m.comment ? `\n> ${m.comment}` : ''}`);
    }
  }
  if (lines.length === 1) lines.push('（注目選手が登録されていません）');
  return lines.join('\n');
}

/** これから行う試合のカード紹介 */
export function matchCardText(t: Tournament, players: PlayerMap, rounds: MatchView[][], m: MatchView): string {
  const total = rounds.length;
  const lines = [`# ${roundName(m.round, total)} 第${m.index + 1}試合 (BO${m.bestOf})`];
  lines.push(`## ${sideLabel(t, m, 'a')} 🆚 ${sideLabel(t, m, 'b')}`);
  for (const which of ['a', 'b'] as const) {
    const id = sideId(m[which]);
    const team = t.teams.find((x) => x.id === id);
    if (!team) continue;
    const status = poolStatus(t, rounds, team.id);
    const avail = status.filter((s) => s.available).map((s) => weaponName(s.weaponId));
    const used = status.filter((s) => !s.available).map((s) => weaponName(s.weaponId));
    lines.push(`**${team.name}**`);
    lines.push(`・選べるブキ: ${avail.join(' / ') || 'なし'}`);
    if (used.length) lines.push(`・使用済み: ${used.join(' / ')}`);
    const featured = roster(team, players)
      .filter((x) => x.member.featured)
      .map((x) => x.player.name);
    if (featured.length) lines.push(`・注目選手: ${featured.join('、')}`);
  }
  return lines.join('\n');
}

function scoreLine(t: Tournament, m: MatchView): string {
  const a = sideLabel(t, m, 'a');
  const b = sideLabel(t, m, 'b');
  const w = sideId(m.winner);
  const bold = (name: string, id: string | null) => (id && id === w ? `**${name}**` : name);
  const score = m.record?.override ? '(不戦勝)' : `${m.winsA} - ${m.winsB}`;
  return `${bold(a, sideId(m.a))} ${score} ${bold(b, sideId(m.b))}`;
}

export function resultsText(t: Tournament, rounds: MatchView[][], withWeapons = true): string {
  const lines = [`# ${t.name} 試合結果`];
  rounds.forEach((round, r) => {
    const done = round.filter((m) => isPlayable(m) && m.winner.kind === 'team');
    if (!done.length) return;
    lines.push(`## ${roundName(r, rounds.length)}`);
    for (const m of done) {
      lines.push(`・${scoreLine(t, m)}`);
      if (withWeapons && m.record) {
        m.record.games.forEach((g, i) => {
          if (!g.weaponA && !g.weaponB && !g.winner) return;
          const mark = g.winner === 'A' ? '◯-✕' : g.winner === 'B' ? '✕-◯' : '-';
          const where = [g.mode, g.stage].filter(Boolean).join(' ');
          lines.push(
            `　${i + 1}戦目 ${weaponName(g.weaponA) || '?'} ${mark} ${weaponName(g.weaponB) || '?'}${where ? `（${where}）` : ''}`,
          );
        });
      }
    }
  });
  const champ = champion(rounds);
  if (champ) lines.push(`\n🏆 **優勝: ${teamName(t, champ)}**`);
  if (lines.length === 1) lines.push('（まだ結果がありません）');
  return lines.join('\n');
}

/** ブキ別の使用回数・勝率 */
export function weaponStatsText(t: Tournament, rounds: MatchView[][]): string {
  const stats = new Map<string, { used: number; won: number }>();
  for (const team of t.teams) {
    for (const u of teamUses(rounds, team.id)) {
      const s = stats.get(u.weaponId) ?? { used: 0, won: 0 };
      s.used++;
      if (u.won) s.won++;
      stats.set(u.weaponId, s);
    }
  }
  const sorted = [...stats].sort((a, b) => b[1].used - a[1].used || b[1].won - a[1].won);
  const lines = [`# ${t.name} ブキ使用状況`];
  for (const [w, s] of sorted) lines.push(`・${weaponName(w)}: ${s.used}回使用 / ${s.won}勝`);
  if (sorted.length === 0) lines.push('（まだ記録がありません）');
  return lines.join('\n');
}
