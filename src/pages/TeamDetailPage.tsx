import { useState } from 'react';
import { CopyButton, Empty, Field, TeamName, WeaponTag } from '../components/ui';
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
      <Empty>
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
    <div className="stack">
      <div className="page-head">
        <a href="#/teams" className="btn ghost">
          ← チーム一覧
        </a>
        <span className="spacer" />
        <CopyButton text={teamText(t, team, rounds)} label="紹介文をコピー" />
        <button className="btn danger" onClick={remove}>
          削除
        </button>
      </div>

      <section className="card team-hero" style={{ borderColor: team.color }}>
        <div className="form-row">
          <Field label="チーム名">
            <input className="input" value={team.name} onChange={(e) => edit((x) => void (x.name = e.target.value))} />
          </Field>
          <Field label="カラー">
            <input
              type="color"
              className="color-input"
              value={team.color}
              onChange={(e) => edit((x) => void (x.color = e.target.value))}
            />
          </Field>
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
        <div className="section-head">
          <h2>
            候補ブキ ({team.pool.length}
            {t.rules.poolMax > 0 && ` / ${t.rules.poolMax}`})
          </h2>
          <button className="btn" onClick={() => setPicking({ kind: 'pool' })}>
            候補ブキを編集
          </button>
        </div>
        <div className="tags">
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
        <div className="section-head">
          <h2>
            メンバー ({team.players.length} / 規定 {t.rules.teamSize} 人)
          </h2>
          <button className="btn" onClick={() => edit((x) => void x.players.push(newPlayer()))}>
            ＋ メンバーを追加
          </button>
        </div>
        {team.players.length === 0 && <Empty>メンバーを追加してください</Empty>}
        <div className="players">
          {team.players.map((p, i) => (
            <div key={p.id} className={`player-edit ${p.featured ? 'featured' : ''}`}>
              <div className="form-row">
                <Field label={`選手${i + 1}`}>
                  <input
                    className="input"
                    placeholder="名前"
                    value={p.name}
                    onChange={(e) => editPlayer(p.id, (y) => void (y.name = e.target.value))}
                  />
                </Field>
                <Field label="XP・ウデマエなど">
                  <input
                    className="input"
                    placeholder="例: XP2500 / S+10"
                    value={p.rank}
                    onChange={(e) => editPlayer(p.id, (y) => void (y.rank = e.target.value))}
                  />
                </Field>
                <div className="checks">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={p.featured}
                      onChange={(e) => editPlayer(p.id, (y) => void (y.featured = e.target.checked))}
                    />
                    ⭐ 注目
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={p.leader}
                      onChange={(e) => editPlayer(p.id, (y) => void (y.leader = e.target.checked))}
                    />
                    👑 リーダー
                  </label>
                </div>
              </div>
              <div className="tags">
                <span className="muted small">得意ブキ:</span>
                {p.mains.map((w) => (
                  <WeaponTag
                    key={w}
                    id={w}
                    onRemove={() => editPlayer(p.id, (y) => void (y.mains = y.mains.filter((m) => m !== w)))}
                  />
                ))}
                <button className="btn ghost small" onClick={() => setPicking({ kind: 'mains', playerId: p.id })}>
                  ＋ 選ぶ
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
              <div className="player-actions">
                <button
                  className="btn ghost small"
                  disabled={i === 0}
                  onClick={() =>
                    edit((x) => void ([x.players[i - 1], x.players[i]] = [x.players[i], x.players[i - 1]]))
                  }
                >
                  ▲
                </button>
                <button
                  className="btn ghost small danger-text"
                  onClick={() =>
                    confirm(`${p.name || 'この選手'}を削除しますか？`) &&
                    edit((x) => void (x.players = x.players.filter((y) => y.id !== p.id)))
                  }
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>使用ブキの記録</h2>
        {uses.length === 0 ? (
          <Empty>トーナメントで記録された試合はまだありません</Empty>
        ) : (
          <ul className="list">
            {uses.map((u) => {
              const opp = t.teams.find((x) => x.id === u.opponentId);
              const [r, i] = u.matchKey.split('-').map(Number);
              return (
                <li key={`${u.matchKey}-${u.gameIndex}`} className="list-row">
                  <span className="muted">
                    {roundName(r, rounds.length)} #{i + 1} - {u.gameIndex + 1}戦目
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
