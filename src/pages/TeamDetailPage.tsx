import { useState } from 'react';
import { AvatarInput } from '../components/AvatarInput';
import { CopyButton, Empty, Field, Icon, IconButton, Switch, TeamName, WeaponTag, XBadge } from '../components/ui';
import { WeaponPicker } from '../components/WeaponPicker';
import { teamText } from '../lib/announce';
import { roundName, type MatchView } from '../lib/bracket';
import { poolStatus, teamUses } from '../lib/usage';
import { navigate } from '../router';
import { newPlayer, updateCurrent } from '../store';
import type { Player, Team, Tournament } from '../types';

type Picking = { kind: 'pool' } | { kind: 'mains'; playerId: string } | null;

export function TeamDetailPage({ t, teamId, rounds }: { t: Tournament; teamId: string; rounds: MatchView[][] }) {
  const team = t.teams.find((x) => x.id === teamId);
  const [picking, setPicking] = useState<Picking>(null);
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
  const editPlayer = (playerId: string, fn: (p: Player) => void) =>
    edit((x) => {
      const p = x.players.find((y) => y.id === playerId);
      if (p) fn(p);
    });

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
  const pickingPlayer = picking?.kind === 'mains' ? team.players.find((p) => p.id === picking.playerId) : null;

  return (
    <div className="page">
      <div className="page-header row">
        <IconButton icon="arrow_back" label="チーム一覧へ戻る" onClick={() => navigate('teams')} />
        <h1 className="headline">
          <TeamName name={team.name || '(チーム名未入力)'} color={team.color} big />
        </h1>
        <span className="spacer" />
        <CopyButton text={teamText(t, team, rounds)} label="紹介文をコピー" variant="tonal" />
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
              <button className="btn tonal" onClick={() => setPicking({ kind: 'pool' })}>
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
              メンバー（{team.players.length} / 規定 {t.rules.teamSize} 人）
            </h2>
            <button className="btn filled" onClick={() => edit((x) => void x.players.push(newPlayer()))}>
              <Icon name="person_add" />
              メンバーを追加
            </button>
          </div>
          {team.players.length === 0 && <Empty icon="person_add">メンバーを追加してください</Empty>}
          <div className="players">
            {team.players.map((p, i) => (
              <div key={p.id} className={`card player-edit ${p.featured ? 'featured' : ''}`}>
                <div className="player-edit-head">
                  <span className="overline">選手 {i + 1}</span>
                  {p.featured && <Icon name="star" filled className="star" />}
                  {p.leader && <Icon name="workspace_premium" filled className="leader" />}
                  <XBadge xp={p.xp} />
                  <span className="spacer" />
                  <IconButton
                    icon="arrow_upward"
                    label="上へ"
                    disabled={i === 0}
                    onClick={() => edit((x) => void ([x.players[i - 1], x.players[i]] = [x.players[i], x.players[i - 1]]))}
                  />
                  <IconButton
                    icon="delete"
                    label="削除"
                    danger
                    onClick={() =>
                      confirm(`${p.name || 'この選手'}を削除しますか？`) &&
                      edit((x) => void (x.players = x.players.filter((y) => y.id !== p.id)))
                    }
                  />
                </div>
                <div className="player-identity">
                  <AvatarInput
                    name={p.name}
                    color={team.color}
                    value={p.avatar}
                    onChange={(v) => editPlayer(p.id, (y) => void (y.avatar = v))}
                  />
                </div>
                <div className="form-row">
                  <Field label="名前">
                    <input
                      className="input"
                      value={p.name}
                      onChange={(e) => editPlayer(p.id, (y) => void (y.name = e.target.value))}
                    />
                  </Field>
                  <Field label="Xパワー" hint="2500以上でバッジ">
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={5000}
                      placeholder="例: 2650"
                      value={p.xp ?? ''}
                      onChange={(e) =>
                        editPlayer(p.id, (y) => {
                          const v = e.target.value === '' ? null : Number(e.target.value);
                          y.xp = v != null && Number.isFinite(v) ? v : null;
                        })
                      }
                    />
                  </Field>
                  <Field label="ウデマエ・メモ">
                    <input
                      className="input"
                      placeholder="例: S+10 / 最高XP2800"
                      value={p.rank}
                      onChange={(e) => editPlayer(p.id, (y) => void (y.rank = e.target.value))}
                    />
                  </Field>
                </div>
                <div className="tags">
                  <span className="label">得意ブキ</span>
                  {p.mains.map((w) => (
                    <WeaponTag
                      key={w}
                      id={w}
                      onRemove={() => editPlayer(p.id, (y) => void (y.mains = y.mains.filter((m) => m !== w)))}
                    />
                  ))}
                  <button className="btn text small" onClick={() => setPicking({ kind: 'mains', playerId: p.id })}>
                    <Icon name="add" />
                    選ぶ
                  </button>
                </div>
                <Field label={p.featured ? '注目ポイント・紹介文' : 'ひとこと'}>
                  <textarea
                    className="input"
                    rows={2}
                    value={p.comment}
                    onChange={(e) => editPlayer(p.id, (y) => void (y.comment = e.target.value))}
                  />
                </Field>
                <div className="switches">
                  <Switch
                    label="注目選手"
                    checked={p.featured}
                    onChange={(v) => editPlayer(p.id, (y) => void (y.featured = v))}
                  />
                  <Switch label="リーダー" checked={p.leader} onChange={(v) => editPlayer(p.id, (y) => void (y.leader = v))} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {picking?.kind === 'pool' && (
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
      {pickingPlayer && (
        <WeaponPicker
          title={`${pickingPlayer.name || '選手'} の得意ブキ`}
          selected={pickingPlayer.mains}
          max={3}
          onChange={(ids) => editPlayer(pickingPlayer.id, (y) => void (y.mains = ids))}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
