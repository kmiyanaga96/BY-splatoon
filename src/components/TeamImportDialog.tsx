import { useMemo, useState } from 'react';
import { kindOf } from '../lib/kinds';
import { importTeams } from '../lib/teamImport';
import { navigate } from '../router';
import { getCanEdit, updateCurrent, useApp, usePlayers } from '../store';
import type { Tournament } from '../types';
import { Field, Icon, Modal, TeamName, showSnackbar } from './ui';

/**
 * 別の大会のチームを選んで、表示中の大会に取り込む。
 * 選手は全大会で共通なので、メンバーのアイコン・Xパワー・成績はそのまま引き継がれる。
 */
export function TeamImportDialog({ t, onClose }: { t: Tournament; onClose: () => void }) {
  const app = useApp();
  const players = usePlayers();
  // 新しい大会から順に。チームのない大会と、表示中の大会は出さない
  const sources = useMemo(() => [...app.tournaments].reverse().filter((x) => x.id !== t.id && x.teams.length > 0), [app.tournaments, t.id]);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const source = sources.find((x) => x.id === sourceId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [withPool, setWithPool] = useState(true);

  const takenPlayers = new Set(t.teams.flatMap((x) => x.members.map((m) => m.playerId)));
  const takenNames = new Set(t.teams.map((x) => x.name));
  const name = (playerId: string) => players.get(playerId)?.name || '(名前未入力)';
  const showPool = kindOf(t).hasPool && !!source?.teams.some((x) => x.pool.length);

  const changeSource = (id: string) => {
    setSourceId(id);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = !!source && source.teams.every((x) => selected.has(x.id));

  const submit = () => {
    if (!source || selected.size === 0) return;
    if (!getCanEdit()) {
      updateCurrent(() => {}); // 閲覧モードの案内を出す
      return;
    }
    let result: ReturnType<typeof importTeams> | null = null;
    updateCurrent((d) => void (result = importTeams(d, source, [...selected], { pool: withPool })));
    const r = result as ReturnType<typeof importTeams> | null;
    if (!r) return;
    const skipped = [...new Set(r.skippedPlayerIds)].map(name);
    showSnackbar(
      `${r.teams.length} チームを取り込みました` +
        (skipped.length ? `（すでにこの大会のチームにいる ${skipped.join('、')} は外しました）` : ''),
    );
    onClose();
    navigate('teams');
  };

  return (
    <Modal
      title="他の大会からチームを取り込む"
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn text" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn filled" disabled={selected.size === 0} onClick={submit}>
            <Icon name="download" />
            {selected.size > 0 ? `${selected.size} チームを取り込む` : 'チームを選んでください'}
          </button>
        </>
      }
    >
      {sources.length === 0 ? (
        <p className="muted">チームが登録されている大会がほかにありません。</p>
      ) : (
        <div className="team-import">
          <p className="muted body-s">
            チーム名・カラー・紹介文・メンバー（リーダー・注目選手を含む）をコピーして、この大会の末尾に追加します。
            元の大会は変わりません。選手は全大会で共通なので、アイコンや Xパワーもそのまま使えます。
          </p>
          <Field label="取り込み元の大会">
            <select className="input" value={sourceId} onChange={(e) => changeSource(e.target.value)}>
              {sources.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.date ? `（${x.date}）` : ''}・{x.teams.length} チーム
                </option>
              ))}
            </select>
          </Field>
          {source && (
            <>
              <label className="team-import-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(source.teams.map((x) => x.id)))}
                />
                すべて選ぶ
              </label>
              <ul className="team-import-list">
                {source.teams.map((team) => {
                  const dup = team.members.filter((m) => takenPlayers.has(m.playerId));
                  return (
                    <li key={team.id}>
                      <label className={`team-import-item ${selected.has(team.id) ? 'selected' : ''}`}>
                        <input type="checkbox" checked={selected.has(team.id)} onChange={() => toggle(team.id)} />
                        <span className="team-import-body">
                          <span className="team-import-name">
                            <TeamName name={team.name} color={team.color} />
                            {takenNames.has(team.name) && <span className="badge">同名のチームあり</span>}
                          </span>
                          <span className="muted body-s">
                            {team.members.length ? team.members.map((m) => name(m.playerId)).join('、') : 'メンバー未登録'}
                          </span>
                          {dup.length > 0 && (
                            <span className="body-s warn-text">
                              <Icon name="warning" /> {dup.map((m) => name(m.playerId)).join('、')} はすでにこの大会のチームにいるため外します
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {showPool && (
                <label className="team-import-all">
                  <input type="checkbox" checked={withPool} onChange={(e) => setWithPool(e.target.checked)} />
                  候補ブキも引き継ぐ（この大会の候補の単位にそろえます）
                </label>
              )}
              {t.league && t.league.groups.length > 1 && (
                <p className="muted body-s">取り込んだチームは、{t.league.only ? 'リーグ戦' : '予選'}ページのグループ分けで振り分けてください。</p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
