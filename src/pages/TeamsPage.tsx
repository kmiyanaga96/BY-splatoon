import type { ReactNode } from 'react';
import { Empty, TeamName, WeaponTag } from '../components/ui';
import { isAlive, type MatchView } from '../lib/bracket';
import { poolStatus } from '../lib/usage';
import { navigate } from '../router';
import { newTeam, updateCurrent } from '../store';
import type { Team, Tournament } from '../types';

export function TeamsPage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const addTeam = () => {
    const team = newTeam(t.teams.length);
    updateCurrent((d) => void d.teams.push(team));
    navigate('teams', team.id);
  };
  const move = (i: number, dir: -1 | 1) =>
    updateCurrent((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.teams.length) return;
      [d.teams[i], d.teams[j]] = [d.teams[j], d.teams[i]];
    });

  return (
    <div className="stack">
      <div className="page-head">
        <h1>チーム ({t.teams.length})</h1>
        <button className="btn primary" onClick={addTeam}>
          ＋ チームを追加
        </button>
      </div>
      <p className="muted">並び順がトーナメント作成時のシード順になります。</p>
      {t.teams.length === 0 && <Empty>まだチームがありません。「チームを追加」から登録してください。</Empty>}
      <div className="grid">
        {t.teams.map((team, i) => (
          <TeamCard key={team.id} t={t} team={team} rounds={rounds} seed={i + 1}>
            <button className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">
              ▲
            </button>
            <button
              className="btn ghost small"
              onClick={() => move(i, 1)}
              disabled={i === t.teams.length - 1}
              aria-label="下へ"
            >
              ▼
            </button>
          </TeamCard>
        ))}
      </div>
    </div>
  );
}

function TeamCard(props: { t: Tournament; team: Team; rounds: MatchView[][]; seed: number; children?: ReactNode }) {
  const { t, team, rounds } = props;
  const inBracket = t.bracket.slots.includes(team.id);
  const alive = isAlive(rounds, team.id);
  const status = poolStatus(t, rounds, team.id);
  return (
    <div className="team-card" style={{ borderTopColor: team.color }}>
      <div className="team-card-head">
        <span className="seed">#{props.seed}</span>
        <a href={`#/teams/${team.id}`} className="team-card-title">
          <TeamName name={team.name} color={team.color} big />
        </a>
        {inBracket && <span className={`badge ${alive ? 'ok' : 'out'}`}>{alive ? '勝ち残り' : '敗退'}</span>}
        <span className="spacer" />
        {props.children}
      </div>
      {team.comment && <p className="pre small clamp">{team.comment}</p>}
      <div className="tags">
        {status.map((s) => (
          <WeaponTag
            key={s.weaponId}
            id={s.weaponId}
            state={!s.available ? 'out' : s.used > 0 ? 'used' : undefined}
            note={s.used > 0 ? `${s.used}回使用` : undefined}
          />
        ))}
        {team.pool.length === 0 && <span className="muted small">候補ブキ未登録</span>}
      </div>
      <ul className="members">
        {team.players.map((p) => (
          <li key={p.id}>
            {p.leader && '👑'}
            {p.featured && '⭐'}
            {p.name || '(名前未入力)'}
            {p.rank && <span className="muted small"> {p.rank}</span>}
          </li>
        ))}
        {team.players.length === 0 && <li className="muted small">メンバー未登録</li>}
      </ul>
      <a className="btn small" href={`#/teams/${team.id}`}>
        編集・詳細
      </a>
    </div>
  );
}
