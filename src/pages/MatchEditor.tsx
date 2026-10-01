import { Avatar, CopyButton, Field, Icon, IconButton, Modal, TeamName, WeaponTag } from '../components/ui';
import { CATEGORIES, WEAPONS, weaponName } from '../data/weapons';
import stages from '../data/stages.json';
import { matchCardText } from '../lib/announce';
import { roundName, sideId, winsNeeded, type MatchView } from '../lib/bracket';
import { lineupIds, roster } from '../lib/roster';
import { blockedWeapons, poolStatus } from '../lib/usage';
import { newGame, updateCurrent, usePlayers } from '../store';
import type { Game, GameMode, MatchRecord, PlayerMap, Team, Tournament } from '../types';

const MODES: GameMode[] = ['', 'ナワバリ', 'エリア', 'ヤグラ', 'ホコ', 'アサリ'];

interface Props {
  t: Tournament;
  rounds: MatchView[][];
  m: MatchView;
  onClose: () => void;
}

export function MatchEditor({ t, rounds, m, onClose }: Props) {
  const players = usePlayers();
  const a = t.teams.find((x) => x.id === sideId(m.a));
  const b = t.teams.find((x) => x.id === sideId(m.b));
  if (!a || !b) {
    return (
      <Modal title="試合" onClose={onClose}>
        <p>対戦カードがまだ決まっていません。</p>
      </Modal>
    );
  }

  const games = m.record?.games ?? [];
  const decided = m.winner.kind === 'team';
  const winner = decided ? t.teams.find((x) => x.id === sideId(m.winner)) : null;

  /** 記録を書き換える。現在の対戦カードと違う古い記録は作り直す */
  const edit = (fn: (rec: MatchRecord) => void) =>
    updateCurrent((d) => {
      let rec = d.bracket.matches[m.key];
      if (!rec || rec.a !== a.id || rec.b !== b.id) {
        rec = { a: a.id, b: b.id, games: [], override: null, note: '' };
        d.bracket.matches[m.key] = rec;
      }
      fn(rec);
    });
  const editGame = (i: number, fn: (g: Game) => void) => edit((rec) => fn(rec.games[i]));

  const addGame = () =>
    edit((rec) => {
      // 前のゲームと同じブキで始める (再使用不可ルールなら空欄)
      rec.games.push(newGame(rec.games.at(-1), t.rules.reuse === 'free'));
    });

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <>
          {roundName(m.round, rounds.length)} 第{m.index + 1}試合
          <span className="dialog-subtitle">
            BO{m.bestOf}（{winsNeeded(m.bestOf)}勝先取）
          </span>
        </>
      }
      actions={
        <>
          <button className="btn text" onClick={onClose}>
            閉じる
          </button>
          <CopyButton text={matchCardText(t, players, rounds, m)} label="対戦カード告知をコピー" />
        </>
      }
    >
      <div className="scoreboard">
        <TeamName name={a.name} color={a.color} big />
        <span className="score">
          {m.winsA} - {m.winsB}
        </span>
        <TeamName name={b.name} color={b.color} big />
      </div>
      {winner && <p className="result-banner"><Icon name="emoji_events" filled /> {winner.name} の勝ち抜け{m.record?.override ? '（勝者を直接指定）' : ''}</p>}

      <div className="two-col">
        <PoolSummary t={t} rounds={rounds} team={a} />
        <PoolSummary t={t} rounds={rounds} team={b} />
      </div>

      <h3 className="title-m">ゲーム記録</h3>
      <div className="games">
        {games.map((g, i) => (
          <div key={i} className="game-row">
            <span className="game-no">{i + 1}戦目</span>
            <select
              className="input"
              value={g.mode}
              onChange={(e) => editGame(i, (x) => void (x.mode = e.target.value as GameMode))}
              aria-label="ルール"
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode || 'ルール'}
                </option>
              ))}
            </select>
            <input
              className="input"
              list="stage-list"
              placeholder="ステージ"
              value={g.stage}
              onChange={(e) => editGame(i, (x) => void (x.stage = e.target.value))}
            />
            <div className="game-side">
              <WeaponSelect
                team={a}
                value={g.weaponA}
                blocked={blockedWeapons(t, rounds, a.id, m.key, i)}
                onChange={(v) => editGame(i, (x) => void (x.weaponA = v))}
              />
              <button
                className={`btn win-btn ${g.winner === 'A' ? 'on' : ''}`}
                aria-pressed={g.winner === 'A'}
                onClick={() => editGame(i, (x) => void (x.winner = x.winner === 'A' ? null : 'A'))}
              >
                {g.winner === 'A' && <Icon name="check" />}
                {a.name} 勝ち
              </button>
              {a.members.length > t.rules.teamSize && (
                <LineupPicker
                  team={a}
                  players={players}
                  size={t.rules.teamSize}
                  value={g.lineupA}
                  onChange={(v) => editGame(i, (x) => void (x.lineupA = v))}
                />
              )}
            </div>
            <div className="game-side">
              <WeaponSelect
                team={b}
                value={g.weaponB}
                blocked={blockedWeapons(t, rounds, b.id, m.key, i)}
                onChange={(v) => editGame(i, (x) => void (x.weaponB = v))}
              />
              <button
                className={`btn win-btn ${g.winner === 'B' ? 'on' : ''}`}
                aria-pressed={g.winner === 'B'}
                onClick={() => editGame(i, (x) => void (x.winner = x.winner === 'B' ? null : 'B'))}
              >
                {g.winner === 'B' && <Icon name="check" />}
                {b.name} 勝ち
              </button>
              {b.members.length > t.rules.teamSize && (
                <LineupPicker
                  team={b}
                  players={players}
                  size={t.rules.teamSize}
                  value={g.lineupB}
                  onChange={(v) => editGame(i, (x) => void (x.lineupB = v))}
                />
              )}
            </div>
            <IconButton icon="delete" label={`${i + 1}戦目を削除`} onClick={() => edit((rec) => void rec.games.splice(i, 1))} />
          </div>
        ))}
        <datalist id="stage-list">
          {stages.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {!decided && games.length < m.bestOf && (
          <button className="btn tonal" onClick={addGame}>
            <Icon name="add" />
            {games.length + 1}戦目を追加
          </button>
        )}
      </div>

      <div className="form-row">
        <Field label="勝者を直接指定（不戦勝・棄権など）">
          <select
            className="input"
            value={m.record?.override ?? ''}
            onChange={(e) => edit((rec) => void (rec.override = e.target.value || null))}
          >
            <option value="">指定しない（ゲーム結果から判定）</option>
            <option value={a.id}>{a.name}</option>
            <option value={b.id}>{b.name}</option>
          </select>
        </Field>
      </div>
      <Field label="メモ">
        <textarea
          className="input"
          rows={2}
          value={m.record?.note ?? ''}
          onChange={(e) => edit((rec) => void (rec.note = e.target.value))}
        />
      </Field>
    </Modal>
  );
}

/** 補欠がいるチームだけ表示する、ゲームごとの出場メンバーの選択 */
function LineupPicker(props: {
  team: Team;
  players: PlayerMap;
  size: number;
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const { team, value, size } = props;
  const current = lineupIds(team, value);
  const toggle = (id: string) => {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    props.onChange(next.length === team.members.length ? null : next);
  };
  return (
    <div className="lineup">
      <span className={`overline ${current.length !== size ? 'warn-text' : ''}`}>
        出場 {current.length}/{size}
        {value === null && '（未指定＝全員）'}
      </span>
      <div className="lineup-chips">
        {roster(team, props.players).map(({ player: p }) => (
          <button
            key={p.id}
            type="button"
            className={`lineup-chip ${current.includes(p.id) ? 'on' : ''}`}
            aria-pressed={current.includes(p.id)}
            onClick={() => toggle(p.id)}
            title={p.name}
          >
            <Avatar name={p.name} src={p.avatar} color={team.color} size={22} />
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function PoolSummary({ t, rounds, team }: { t: Tournament; rounds: MatchView[][]; team: Team }) {
  return (
    <div className="pool-summary" style={{ borderColor: team.color }}>
      <span className="label">{team.name} の候補ブキ</span>
      <div className="tags">
        {poolStatus(t, rounds, team.id).map((s) => (
          <WeaponTag
            key={s.weaponId}
            id={s.weaponId}
            state={!s.available ? 'out' : s.used ? 'used' : undefined}
            note={s.used ? `${s.used}回` : undefined}
          />
        ))}
        {team.pool.length === 0 && <span className="muted body-s">未登録</span>}
      </div>
    </div>
  );
}

function WeaponSelect(props: { team: Team; value: string; blocked: Set<string>; onChange: (v: string) => void }) {
  const { team, value, blocked } = props;
  const others = WEAPONS.filter((w) => !team.pool.includes(w.id) && (!w.replica || w.id === value));
  const invalid = !!value && blocked.has(value);
  const offPool = !!value && !team.pool.includes(value);
  return (
    <select
      className={`input weapon-select ${invalid ? 'invalid' : offPool ? 'offpool' : ''}`}
      value={value}
      onChange={(e) => props.onChange(e.target.value)}
      aria-label={`${team.name}の使用ブキ`}
      title={invalid ? 'ルール上このブキはすでに使用済みです' : offPool ? '候補ブキに登録されていないブキです' : undefined}
    >
      <option value="">ブキ未選択</option>
      <optgroup label="候補ブキ">
        {team.pool.map((id) => (
          <option key={id} value={id} disabled={blocked.has(id) && id !== value}>
            {weaponName(id)}
            {blocked.has(id) ? '（使用済み）' : ''}
          </option>
        ))}
      </optgroup>
      {CATEGORIES.map((c) => (
        <optgroup key={c.id} label={`候補外: ${c.name}`}>
          {others
            .filter((w) => w.category === c.id)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
