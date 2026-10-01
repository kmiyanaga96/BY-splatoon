import { useState } from 'react';
import { PlayerProfileFields } from '../components/PlayerProfileFields';
import { PlayerSelect } from '../components/PlayerSelect';
import { CopyButton, Empty, Field, Icon, IconButton, Switch, TeamName, WeaponTag, XBadge } from '../components/ui';
import { WeaponPicker } from '../components/WeaponPicker';
import { teamText } from '../lib/announce';
import { roundName, type MatchView } from '../lib/bracket';
import { roster } from '../lib/roster';
import { poolStatus, teamUses } from '../lib/usage';
import { navigate } from '../router';
import { newMember, newPlayer, update, updateCurrent, useApp, usePlayers } from '../store';
import type { Member, Team, Tournament } from '../types';

type Picking = 'pool' | 'members' | null;

export function TeamDetailPage({ t, teamId, rounds }: { t: Tournament; teamId: string; rounds: MatchView[][] }) {
  const team = t.teams.find((x) => x.id === teamId);
  const [picking, setPicking] = useState<Picking>(null);
  const app = useApp();
  const players = usePlayers();
  if (!team) {
    return (
      <Empty icon="groups">
        チームが見つかりません。<a href="#/teams">チーム一覧へ戻る</a>
      </Empty>
    );
  }

  const edit = (fn: (team: Team) => void) =>
    updateCurrent((d) => {
      const x = d.teams.find((y) => y.id === teamId);
      if (x) fn(x);
    });
  const editMember = (playerId: string, fn: (m: Member) => void) =>
    edit((x) => {
      const m = x.members.find((y) => y.playerId === playerId);
      if (m) fn(m);
    });

  // 同じ大会の別チームに入っている選手は選べない
  const unavailable = new Map<string, string>();
  for (const o of t.teams) for (const m of o.members) unavailable.set(m.playerId, o.id === teamId ? 'このチーム' : o.name);
  const addMember = (playerId: string) => edit((x) => void x.members.push(newMember(playerId)));
  const createMember = (name: string) => {
    const p = newPlayer(name);
    update((d) => {
      d.players.push(p);
      d.tournaments.find((x) => x.id === d.currentId)?.teams.find((x) => x.id === teamId)?.members.push(newMember(p.id));
    });
  };

  const remove = () => {
    if (!confirm(`「${team.name}」を削除しますか？（トーナメント表の枠は空きになります）`)) return;
    updateCurrent((d) => {
      d.teams = d.teams.filter((x) => x.id !== teamId);
      d.bracket.slots = d.bracket.slots.map((s) => (s === teamId ? null : s));
    });
    navigate('teams');
  };

  // 候補ブキの重複チェック用: 他チームの登録状況
  const others = new Map<string, string>();
  for (const o of t.teams) {
    if (o.id === teamId) continue;
    for (const w of o.pool) others.set(w, others.has(w) ? `${others.get(w)}, ${o.name}` : o.name);
  }
  const status = poolStatus(t, rounds, teamId);
  const uses = teamUses(rounds, teamId);
  const members = roster(team, players);

  return (
    <div className="page">
      <div className="page-header row">
        <IconButton icon="arrow_back" label="チーム一覧へ戻る" onClick={() => navigate('teams')} />
        <h1 className="headline">
          <TeamName name={team.name || '(チーム名未入力)'} color={team.color} big />
        </h1>
        <span className="spacer" />
        <CopyButton text={teamText(t, team, players, rounds)} label="紹介文をコピー" variant="tonal" />
        <button className="btn text danger" onClick={remove}>
          <Icon name="delete" />
          削除
        </button>
      </div>

      <div className="detail-layout">
        <div className="detail-side">
          <section className="card" style={{ borderTop: `4px solid ${team.color}` }}>
            <h2 className="card-title">チーム情報</h2>
            <div className="form-row">
              <Field label="チーム名">
                <input className="input" value={team.name} onChange={(e) => edit((x) => void (x.name = e.target.value))} />
              </Field>
              <label className="color-field" title="チームカラー">
                <input
                  type="color"
                  className="color-input"
                  value={team.color}
                  onChange={(e) => edit((x) => void (x.color = e.target.value))}
                  aria-label="チームカラー"
                />
              </label>
            </div>
            <Field label="チーム紹介・意気込み">
              <textarea
                className="input"
                rows={3}
                value={team.comment}
                onChange={(e) => edit((x) => void (x.comment = e.target.value))}
              />
            </Field>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">
                候補ブキ（{team.pool.length}
                {t.rules.poolMax > 0 && ` / ${t.rules.poolMax}`}）
              </h2>
              <button className="btn tonal" onClick={() => setPicking('pool')}>
                <Icon name="edit" />
                編集
              </button>
            </div>
            <div className="tags tags-lg">
              {status.map((s) => {
                const dup = others.get(s.weaponId);
                return (
                  <WeaponTag
                    key={s.weaponId}
                    id={s.weaponId}
                    state={!s.available ? 'out' : dup && !t.rules.allowDuplicate ? 'warn' : s.used ? 'used' : undefined}
                    note={[s.used ? `${s.used}回使用` : '', dup ? `${dup}と重複` : ''].filter(Boolean).join(' / ') || undefined}
                    onRemove={() => edit((x) => void (x.pool = x.pool.filter((w) => w !== s.weaponId)))}
                  />
                );
              })}
              {team.pool.length === 0 && <span className="muted">まだ登録されていません</span>}
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">使用ブキの記録</h2>
            {uses.length === 0 ? (
              <Empty>トーナメントで記録された試合はまだありません</Empty>
            ) : (
              <ul className="list">
                {uses.map((u) => {
                  const opp = t.teams.find((x) => x.id === u.opponentId);
                  const [r, i] = u.matchKey.split('-').map(Number);
                  return (
                    <li key={`${u.matchKey}-${u.gameIndex}`} className="list-row">
                      <span className="overline">
                        {roundName(r, rounds.length)} #{i + 1}・{u.gameIndex + 1}戦目
                      </span>
                      <WeaponTag id={u.weaponId} />
                      <span>vs {opp ? <TeamName name={opp.name} color={opp.color} /> : '?'}</span>
                      <span className={u.won ? 'win' : u.won === false ? 'lose' : 'muted'}>
                        {u.won ? 'WIN' : u.won === false ? 'LOSE' : '-'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="detail-main">
          <div className="section-head">
            <h2 className="section-title">
              メンバー（{team.members.length} / 規定 {t.rules.teamSize} 人）
            </h2>
            <button className="btn filled" onClick={() => setPicking('members')}>
              <Icon name="person_add" />
              選手を追加
            </button>
          </div>
          <p className="muted body-s">
            アイコン・名前・Xパワー・得意ブキは選手 DB に保存され、他の大会でも共通です。注目選手・リーダー・紹介文はこの大会だけの設定です。
          </p>
          {team.members.length === 0 && <Empty icon="person_add">「選手を追加」から選手 DB の選手を選ぶか、新しく登録してください</Empty>}
          <div className="players">
            {members.map(({ member: m, player: p }, i) => (
              <div key={p.id} className={`card player-edit ${m.featured ? 'featured' : ''}`}>
                <div className="player-edit-head">
                  <span className="overline">選手 {i + 1}</span>
                  {m.featured && <Icon name="star" filled className="star" />}
                  {m.leader && <Icon name="workspace_premium" filled className="leader" />}
                  <XBadge xp={p.xp} />
                  <span className="spacer" />
                  <IconButton
                    icon="arrow_upward"
                    label="上へ"
                    disabled={i === 0}
                    onClick={() => edit((x) => void ([x.members[i - 1], x.members[i]] = [x.members[i], x.members[i - 1]]))}
                  />
                  <IconButton icon="person" label="選手ページを開く" onClick={() => navigate('players', p.id)} />
                  <IconButton
                    icon="person_remove"
                    label="チームから外す"
                    danger
                    onClick={() =>
                      confirm(`${p.name || 'この選手'}をチームから外しますか？（選手 DB からは消えません）`) &&
                      edit((x) => void (x.members = x.members.filter((y) => y.playerId !== p.id)))
                    }
                  />
                </div>
                <PlayerProfileFields player={p} color={team.color} />
                <Field label={m.featured ? '注目ポイント・紹介文（この大会）' : 'ひとこと（この大会）'}>
                  <textarea
                    className="input"
                    rows={2}
                    value={m.comment}
                    onChange={(e) => editMember(p.id, (y) => void (y.comment = e.target.value))}
                  />
                </Field>
                <div className="switches">
                  <Switch label="注目選手" checked={m.featured} onChange={(v) => editMember(p.id, (y) => void (y.featured = v))} />
                  <Switch label="リーダー" checked={m.leader} onChange={(v) => editMember(p.id, (y) => void (y.leader = v))} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {picking === 'pool' && (
        <WeaponPicker
          title={`${team.name} の候補ブキ`}
          selected={team.pool}
          max={t.rules.poolMax}
          notes={new Map([...others].map(([w, names]) => [w, `登録済: ${names}`]))}
          disabled={t.rules.allowDuplicate ? undefined : new Set(others.keys())}
          onChange={(ids) => edit((x) => void (x.pool = ids))}
          onClose={() => setPicking(null)}
        />
      )}
      {picking === 'members' && (
        <PlayerSelect
          title={`${team.name} に選手を追加`}
          players={app.players}
          unavailable={unavailable}
          color={team.color}
          onSelect={addMember}
          onCreate={createMember}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
