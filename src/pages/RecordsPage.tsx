import { useMemo, useState, type CSSProperties } from 'react';
import { Avatar, Empty, Segmented, TeamName, WeaponIcon, WeaponTag } from '../components/ui';
import { CATEGORIES, categoryOf, weaponName } from '../data/weapons';
import { roundName, sideId, type MatchView } from '../lib/bracket';
import { allPicks, gamePicks, percent, usageBy, type PlayerPick } from '../lib/records';
import { roster } from '../lib/roster';
import { usePlayers } from '../store';
import type { PlayerMap, Team, Tournament } from '../types';

type By = 'weapon' | 'category';

/**
 * 選手ごとのブキ記録の集計 (通常ルールの大会でブキ表の代わりに表示する)。
 * 使用率は「入力された使用ブキ全体 (選手 × ゲーム) のうちの割合」。
 */
export function RecordsPage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const players = usePlayers();
  const picks = useMemo(() => allPicks(t, rounds), [t, rounds]);
  const [by, setBy] = useState<By>('weapon');
  const rows = useMemo(() => usageBy(picks, by), [picks, by]);
  const games = new Set(picks.map((p) => `${p.matchKey}:${p.gameIndex}`)).size;
  const maxUses = rows[0]?.uses ?? 0;

  return (
    <div className="page">
      <div className="page-header row">
        <h1 className="headline">記録</h1>
        <span className="spacer" />
        <Segmented
          value={by}
          onChange={setBy}
          options={[
            { value: 'weapon', label: 'ブキ別' },
            { value: 'category', label: 'カテゴリ別' },
          ]}
        />
      </div>
      <p className="muted">
        試合記録で入力した選手ごとの使用ブキを集計します（{games} ゲーム・のべ {picks.length} 人分）。
        使用率は入力された使用ブキ全体に占める割合です。
      </p>

      {picks.length === 0 ? (
        <Empty icon="table_view">トーナメントの試合記録で、選手ごとの使用ブキを入力するとここに集計されます</Empty>
      ) : (
        <>
          <section className="card">
            <h2 className="card-title">{by === 'weapon' ? 'ブキ' : 'カテゴリ'}別の使用率・勝率</h2>
            <div className="table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>{by === 'weapon' ? 'ブキ' : 'カテゴリ'}</th>
                    <th className="num">使用</th>
                    <th>使用率</th>
                    <th className="num">勝率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const color = by === 'weapon' ? categoryOf(r.id)?.color : CATEGORIES.find((c) => c.id === r.id)?.color;
                    return (
                      <tr key={r.id} style={{ '--c': color } as CSSProperties}>
                        <th>
                          <span className="usage-name">
                            {by === 'weapon' ? <WeaponIcon id={r.id} size={32} /> : <span className="usage-dot" />}
                            {by === 'weapon' ? weaponName(r.id) : CATEGORIES.find((c) => c.id === r.id)?.name}
                          </span>
                        </th>
                        <td className="num">{r.uses}</td>
                        <td>
                          <span className="usage-rate">
                            <span className="usage-bar">
                              <span style={{ width: `${(r.uses / maxUses) * 100}%` }} />
                            </span>
                            <span className="usage-pct">{percent(r.uses, picks.length)}</span>
                          </span>
                        </td>
                        <td className="num" title={`${r.wins}勝 / 勝敗入力済み ${r.decided}`}>
                          {percent(r.wins, r.decided)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <h2 className="section-title">選手別</h2>
          <div className="grid team-grid">
            {t.teams.map((team) => (
              <TeamPicks key={team.id} team={team} players={players} picks={picks.filter((p) => p.teamId === team.id)} />
            ))}
          </div>

          <h2 className="section-title">試合ごと</h2>
          <MatchLog t={t} rounds={rounds} players={players} />
        </>
      )}
    </div>
  );
}

function TeamPicks({ team, players, picks }: { team: Team; players: PlayerMap; picks: PlayerPick[] }) {
  return (
    <article className="card" style={{ borderTop: `4px solid ${team.color}` }}>
      <TeamName name={team.name} color={team.color} big />
      <ul className="list">
        {roster(team, players).map(({ player: p }) => {
          const mine = usageBy(
            picks.filter((x) => x.playerId === p.id),
            'weapon',
          );
          return (
            <li key={p.id} className="record-player">
              <span className="player-title">
                <Avatar name={p.name} src={p.avatar} color={team.color} size={28} />
                {p.name}
              </span>
              <span className="tags">
                {mine.map((r) => (
                  <WeaponTag key={r.id} id={r.id} note={`${r.uses}回`} />
                ))}
                {mine.length === 0 && <span className="muted body-s">記録なし</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/** 試合 → ゲームごとに、両チームのメンバーが何を使ったか */
function MatchLog({ t, rounds, players }: { t: Tournament; rounds: MatchView[][]; players: PlayerMap }) {
  const matches = rounds.flat().filter((m) => m.record?.games.length);
  return (
    <div className="match-log">
      {matches.map((m) => {
        const a = t.teams.find((x) => x.id === sideId(m.a));
        const b = t.teams.find((x) => x.id === sideId(m.b));
        return (
          <section key={m.key} className="card">
            <h3 className="title-m">
              {roundName(m.round, rounds.length)} #{m.index + 1}　{a?.name ?? '?'} {m.winsA} - {m.winsB} {b?.name ?? '?'}
            </h3>
            {m.record!.games.map((g, i) => (
              <div key={i} className="match-log-game">
                <span className="overline">
                  {i + 1}戦目 {[g.mode, g.stage].filter(Boolean).join(' ')}
                </span>
                {(['A', 'B'] as const).map((side) => {
                  const team = side === 'A' ? a : b;
                  const used = gamePicks(team, g, side);
                  return (
                    <div key={side} className="match-log-side">
                      {team && <TeamName name={team.name} color={team.color} />}
                      {g.winner === side && <span className="match-log-win">WIN</span>}
                      <span className="match-log-picks">
                        {[...used].map(([pid, w]) => (
                          <span key={pid} className="match-log-pick" title={`${players.get(pid)?.name ?? '?'}: ${weaponName(w)}`}>
                            <WeaponIcon id={w} size={28} />
                            <small>{players.get(pid)?.name ?? '?'}</small>
                          </span>
                        ))}
                        {used.size === 0 && <span className="muted body-s">未入力</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
