import { Avatar, Empty, Icon, IconButton, TeamName, WeaponTag, XBadge } from '../components/ui';
import { isAlive, type MatchView } from '../lib/bracket';
import { kindOf } from '../lib/kinds';
import { roster } from '../lib/roster';
import { poolStatus } from '../lib/usage';
import { navigate } from '../router';
import { newTeam, updateCurrent, usePlayers } from '../store';
import type { Tournament } from '../types';

export function TeamsPage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const players = usePlayers();
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
    <div className="page">
      <div className="page-header">
        <h1 className="headline">チーム（{t.teams.length}）</h1>
        <p className="muted">並び順がトーナメント作成時のシード順になります。</p>
      </div>
      {t.teams.length === 0 && <Empty icon="groups">まだチームがありません。右下の「チームを追加」から登録してください。</Empty>}
      <div className="grid team-grid">
        {t.teams.map((team, i) => {
          const inBracket = t.bracket.slots.includes(team.id);
          const alive = isAlive(rounds, team.id);
          const status = poolStatus(t, rounds, team.id);
          return (
            <article key={team.id} className="card team-card" style={{ borderTopColor: team.color }}>
              <div className="team-card-head">
                <span className="seed">#{i + 1}</span>
                <a href={`#/teams/${team.id}`} className="team-card-title">
                  <TeamName name={team.name} color={team.color} big />
                </a>
                <span className="spacer" />
                {inBracket && <span className={`badge ${alive ? 'ok' : 'out'}`}>{alive ? '勝ち残り' : '敗退'}</span>}
              </div>
              {team.comment && <p className="pre body-s clamp muted">{team.comment}</p>}
              {kindOf(t).hasPool && (
              <div>
                <div className="label">候補ブキ</div>
                <div className="tags">
                  {status.map((s) => (
                    <WeaponTag
                      key={s.weaponId}
                      id={s.weaponId}
                      state={!s.available ? 'out' : s.used > 0 ? 'used' : undefined}
                      note={s.used > 0 ? `${s.used}回使用` : undefined}
                    />
                  ))}
                  {team.pool.length === 0 && <span className="muted body-s">未登録</span>}
                </div>
              </div>
              )}
              <div>
                <div className="label">メンバー（{team.members.length}）</div>
                <ul className="members">
                  {roster(team, players).map(({ member: m, player: p }) => (
                    <li key={p.id}>
                      <Avatar name={p.name} src={p.avatar} color={team.color} size={24} />
                      {m.leader && <Icon name="workspace_premium" filled className="leader" />}
                      {m.featured && <Icon name="star" filled className="star" />}
                      {p.name || '(名前未入力)'}
                      <XBadge xp={p.xp} />
                    </li>
                  ))}
                  {team.members.length === 0 && <li className="muted body-s">未登録</li>}
                </ul>
              </div>
              <div className="card-actions">
                <IconButton icon="arrow_upward" label="シードを上げる" onClick={() => move(i, -1)} disabled={i === 0} />
                <IconButton
                  icon="arrow_downward"
                  label="シードを下げる"
                  onClick={() => move(i, 1)}
                  disabled={i === t.teams.length - 1}
                />
                <span className="spacer" />
                <a className="btn tonal" href={`#/teams/${team.id}`}>
                  <Icon name="edit" />
                  編集
                </a>
              </div>
            </article>
          );
        })}
      </div>
      <button className="fab" onClick={addTeam}>
        <Icon name="add" />
        チームを追加
      </button>
    </div>
  );
}
