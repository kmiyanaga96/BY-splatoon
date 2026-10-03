import { Avatar, CopyButton, Field, Icon, IconButton, Modal, TeamName, WeaponIcon, WeaponTag } from '../components/ui';
import { CATEGORIES, WEAPONS, getMain, unitKey, weaponName, type Weapon } from '../data/weapons';
import stages from '../data/stages.json';
import { matchCardText } from '../lib/announce';
import { sideId, winsNeeded, type MatchView } from '../lib/bracket';
import { kindOf, selectableWeapons } from '../lib/kinds';
import { drawWeapons } from '../lib/random';
import { lineupIds, roster } from '../lib/roster';
import { blockedWeapons, poolStatus } from '../lib/usage';
import { applyScore } from '../model';
import { newGame, updateCurrent, usePlayers } from '../store';
import type { Game, GameMode, MatchRecord, PlayerMap, PoolUnit, Team, Tournament } from '../types';

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

  const kind = kindOf(t);
  const selectable = selectableWeapons(t);
  // ランダムブキの抽選のタイミング (ランダムブキの大会以外は null)
  const random = t.rules.kind === 'random' ? t.rules.randomTiming : null;
  /** 新しいゲームのブキ: ゲームごとに抽選する大会は前のゲームから引き継がず、大会で 1 回なら抽選結果を入れる */
  const prepareRandom = (g: Game) => {
    if (random === 'game') {
      g.picksA = null;
      g.picksB = null;
    } else if (random === 'tournament') {
      g.picksA = drawnFor(a!, g.lineupA);
      g.picksB = drawnFor(b!, g.lineupB);
    }
  };
  const drawnFor = (team: Team, lineup: string[] | null) => {
    const picks = Object.fromEntries(lineupIds(team, lineup).flatMap((id) => (team.draws[id] ? [[id, team.draws[id]]] : [])));
    return Object.keys(picks).length ? picks : null;
  };
  const games = m.record?.games ?? [];
  const decided = m.winner.kind === 'team';
  const winner = decided ? t.teams.find((x) => x.id === sideId(m.winner)) : null;

  /** 記録を書き換える。現在の対戦カードと違う古い記録は作り直す */
  const edit = (fn: (rec: MatchRecord) => void) =>
    updateCurrent((d) => {
      // 予選リーグの試合は league.matches、本選は bracket.matches に記録する
      const store = m.stage === 'league' ? d.league?.matches : d.bracket.matches;
      if (!store) return;
      let rec = store[m.key];
      if (!rec || rec.a !== a.id || rec.b !== b.id) {
        rec = { a: a.id, b: b.id, games: [], override: null, note: '' };
        store[m.key] = rec;
      }
      fn(rec);
    });
  const editGame = (i: number, fn: (g: Game) => void) => edit((rec) => fn(rec.games[i]));

  const setScore = (winsA: number, winsB: number) =>
    edit((rec) => {
      const before = rec.games.length;
      rec.games = applyScore(rec.games, winsA, winsB);
      // 足されたゲームは「ゲームを追加」と同じく、抽選のタイミングに合わせてブキを入れ直す
      for (const g of rec.games.slice(before)) prepareRandom(g);
    });

  const addGame = () =>
    edit((rec) => {
      // 前のゲームと同じブキで始める (再使用不可ルールなら空欄)
      const g = newGame(rec.games.at(-1), t.rules.reuse === 'free');
      prepareRandom(g);
      rec.games.push(g);
    });

  /** ランダムブキ: ゲーム i (省略時は試合のすべてのゲーム) の両チームのブキを抽選する */
  const draw = (i?: number) => {
    const targets = i === undefined ? games : [games[i]];
    if (targets.some((g) => g?.picksA || g?.picksB) && !confirm('入力済みのブキを抽選し直しますか？')) return;
    edit((rec) => {
      if (rec.games.length === 0) rec.games.push(newGame());
      const lineup = rec.games[i ?? 0];
      const picksA = drawWeapons(lineupIds(a, lineup.lineupA));
      const picksB = drawWeapons(lineupIds(b, lineup.lineupB));
      for (const g of i === undefined ? rec.games : [rec.games[i]]) {
        g.picksA = { ...picksA };
        g.picksB = { ...picksB };
      }
    });
  };

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <>
          {m.label}
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
        {/* 勝利本数を直接入れると、ゲーム記録の勝敗をそろえる (ブキなどは各ゲームで入力) */}
        <span className="score">
          <ScoreInput label={`${a.name}の勝利本数`} value={m.winsA} max={m.bestOf} onChange={(v) => setScore(v, m.winsB)} />
          -
          <ScoreInput label={`${b.name}の勝利本数`} value={m.winsB} max={m.bestOf} onChange={(v) => setScore(m.winsA, v)} />
        </span>
        <TeamName name={b.name} color={b.color} big />
      </div>
      {winner && <p className="result-banner"><Icon name="emoji_events" filled /> {winner.name} の勝ち抜け{m.record?.override ? '（勝者を直接指定）' : ''}</p>}

      {kind.hasPool && (
        <div className="two-col">
          <PoolSummary t={t} rounds={rounds} team={a} />
          <PoolSummary t={t} rounds={rounds} team={b} />
        </div>
      )}

      {random === 'match' && (
        <div className="card-actions draw-actions">
          <button className="btn filled" onClick={() => draw()}>
            <Icon name="shuffle" />
            この試合のブキを抽選（選手ごと）
          </button>
        </div>
      )}
      {random === 'tournament' && (
        <p className="muted body-s">ブキは大会で 1 回抽選した結果を使います（チーム画面で抽選）。</p>
      )}
      {random === 'game' && <p className="muted body-s">各ゲームの抽選ボタンで、そのゲームのブキを選手ごとに抽選します。</p>}
      <h3 className="title-m">ゲーム記録</h3>
      <div className="games">
        {games.map((g, i) => (
          <div key={i} className={`game-row ${kind.playerWeapons ? 'with-picks' : ''}`}>
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
              {kind.teamWeapon && <WeaponSelect
                team={a}
                unit={t.rules.poolUnit}
                value={g.weaponA}
                blocked={blockedWeapons(t, rounds, a.id, m.key, i)}
                onChange={(v) => editGame(i, (x) => void (x.weaponA = v))}
              />}
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
              {kind.playerWeapons && (
                <PlayerWeapons
                  team={a}
                  players={players}
                  lineup={g.lineupA}
                  value={g.picksA}
                  weapons={selectable}
                  onChange={(v) => editGame(i, (x) => void (x.picksA = v))}
                />
              )}
            </div>
            <div className="game-side">
              {kind.teamWeapon && <WeaponSelect
                team={b}
                unit={t.rules.poolUnit}
                value={g.weaponB}
                blocked={blockedWeapons(t, rounds, b.id, m.key, i)}
                onChange={(v) => editGame(i, (x) => void (x.weaponB = v))}
              />}
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
              {kind.playerWeapons && (
                <PlayerWeapons
                  team={b}
                  players={players}
                  lineup={g.lineupB}
                  value={g.picksB}
                  weapons={selectable}
                  onChange={(v) => editGame(i, (x) => void (x.picksB = v))}
                />
              )}
            </div>
            {random === 'game' ? (
              <span className="game-actions">
                <IconButton icon="shuffle" label={`${i + 1}戦目のブキを抽選`} onClick={() => draw(i)} />
                <IconButton icon="delete" label={`${i + 1}戦目を削除`} onClick={() => edit((rec) => void rec.games.splice(i, 1))} />
              </span>
            ) : (
              <IconButton icon="delete" label={`${i + 1}戦目を削除`} onClick={() => edit((rec) => void rec.games.splice(i, 1))} />
            )}
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

/** 選手ごとの使用ブキ (通常ルールの大会)。出場メンバーだけ並べる */
function PlayerWeapons(props: {
  team: Team;
  players: PlayerMap;
  lineup: string[] | null;
  value: Record<string, string> | null;
  onChange: (v: Record<string, string> | null) => void;
  /** 選べるブキ (カテゴリ縛りなら指定カテゴリだけ) */
  weapons: Weapon[];
}) {
  const { team, value } = props;
  const ids = lineupIds(team, props.lineup);
  const set = (playerId: string, weaponId: string) => {
    const next = { ...(value ?? {}) };
    if (weaponId) next[playerId] = weaponId;
    else delete next[playerId];
    props.onChange(Object.keys(next).length ? next : null);
  };
  if (ids.length === 0) return <span className="muted body-s">メンバー未登録</span>;
  return (
    <div className="player-weapons">
      {ids.map((id) => {
        const name = props.players.get(id)?.name ?? '(削除された選手)';
        const weaponId = value?.[id] ?? '';
        return (
          <label key={id} className="player-weapon">
            <span className="player-weapon-name" title={name}>
              {name}
            </span>
            <span className="player-weapon-icon">{weaponId && <WeaponIcon id={weaponId} size={24} />}</span>
            <select className="input" value={weaponId} onChange={(e) => set(id, e.target.value)} aria-label={`${name}の使用ブキ`}>
              <option value="">ブキ未入力</option>
              {CATEGORIES.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {props.weapons.filter((w) => w.category === c.id && (!w.replica || w.id === weaponId)).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function ScoreInput(props: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      className="score-input"
      type="number"
      inputMode="numeric"
      min={0}
      max={props.max}
      value={props.value}
      aria-label={props.label}
      title={`${props.label}（入力するとゲーム記録の勝敗をそろえます）`}
      onChange={(e) => props.onChange(Math.min(props.max, Math.max(0, Number(e.target.value) || 0)))}
    />
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

/**
 * 使用ブキの選択。候補を先頭に、候補外のブキはカテゴリ別に並べる。
 * メイン単位のルールでは、候補のメインに含まれるブキ (マイナーチェンジ) をどれでも選べる。
 * メンバーが別々のマイナーチェンジを使ったときは、メインそのもの (「〇〇系（混在）」) を選ぶ。
 */
function WeaponSelect(props: { team: Team; unit: PoolUnit; value: string; blocked: Set<string>; onChange: (v: string) => void }) {
  const { team, unit, value, blocked } = props;
  const key = (id: string) => unitKey(unit, id);
  const pool = new Set(team.pool);
  const isBlocked = (id: string) => blocked.has(key(id)) && id !== value;
  const visible = (w: { id: string; replica: boolean }) => !w.replica || w.id === value;
  const others = WEAPONS.filter((w) => !pool.has(key(w.id)) && visible(w));
  const invalid = !!value && blocked.has(key(value));
  const offPool = !!value && !pool.has(key(value));
  const used = (id: string) => (blocked.has(key(id)) ? '（使用済み）' : '');
  return (
    <select
      className={`input weapon-select ${invalid ? 'invalid' : offPool ? 'offpool' : ''}`}
      value={value}
      onChange={(e) => props.onChange(e.target.value)}
      aria-label={`${team.name}の使用ブキ`}
      title={invalid ? 'ルール上このブキはすでに使用済みです' : offPool ? '候補ブキに登録されていないブキです' : undefined}
    >
      <option value="">ブキ未選択</option>
      {unit === 'main' ? (
        team.pool.map((id) => (
          <optgroup key={id} label={`候補: ${weaponName(id)}${used(id)}`}>
            {/* マイナーチェンジを混ぜて使ったとき (メンバーごとに違うブキ) はメインで記録する */}
            <option value={id} disabled={isBlocked(id)}>
              {weaponName(id)}（混在）
            </option>
            {(getMain(id)?.variants ?? [])
              .filter(visible)
              .map((w) => (
                <option key={w.id} value={w.id} disabled={isBlocked(w.id)}>
                  {w.name}
                </option>
              ))}
          </optgroup>
        ))
      ) : (
        <optgroup label="候補ブキ">
          {team.pool.map((id) => (
            <option key={id} value={id} disabled={isBlocked(id)}>
              {weaponName(id)}
              {used(id)}
            </option>
          ))}
        </optgroup>
      )}
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
