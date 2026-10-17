import { DateTimeField } from '../components/DateTimePicker';
import { Field, FilterChip, Icon, IconButton, Switch } from '../components/ui';
import { CATEGORIES, WEAPON_DATA_VERSION, WEAPONS } from '../data/weapons';
import { TIEBREAKER_LABEL } from '../lib/league';
import { TAIKAI_SUPPORT_TIEBREAKERS, TIEBREAKERS, convertPool, makeGroups, newLeague } from '../model';
import { backupJson, createTournament, getCanEdit, newId, update, updateCurrent, useApp } from '../store';
import { BRAND_OPTIONS } from '../lib/brand';
import { KIND_OPTIONS, RANDOM_TIMING_LABEL, kindOf } from '../lib/kinds';
import type { PoolUnit, RandomTiming, ReuseRule, Rules, Tiebreaker, Tournament, TournamentKind } from '../types';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

export function SettingsPage({ t }: { t: Tournament }) {
  const app = useApp();
  const kind = kindOf(t);
  const setRule = <K extends keyof Rules>(k: K, v: Rules[K]) => updateCurrent((d) => void (d.rules[k] = v));
  // 単位を変えたら登録済みの候補もそろえる (ブキ→メインはまとめる、メイン→ブキは代表ブキにする)
  const setPoolUnit = (unit: PoolUnit) =>
    updateCurrent((d) => {
      d.rules.poolUnit = unit;
      for (const team of d.teams) team.pool = convertPool(team.pool, unit);
    });

  const duplicate = () => {
    // チーム・ルールはそのまま、トーナメント表は空にして複製 (次回大会の下準備用)
    const copy: Tournament = {
      ...structuredClone(t),
      id: newId(),
      name: `${t.name} のコピー`,
      league: t.league ? { ...structuredClone(t.league), matches: {} } : null,
      bracket: { slots: [], matches: {} },
    };
    update((d) => {
      d.tournaments.push(copy);
      d.currentId = copy.id;
    });
  };

  const remove = () => {
    if (!confirm(`大会「${t.name}」を削除しますか？\n全員の画面から消え、取り消せません（表彰ページの動画も削除されます）。`)) return;
    if (!getCanEdit()) {
      update(() => {}); // 閲覧モードの案内を出す
      return;
    }
    update((d) => {
      d.tournaments = d.tournaments.filter((x) => x.id !== t.id);
      d.currentId = d.tournaments.at(-1)?.id ?? '';
    });
    // 表彰ページの「優勝賞品の動画」も消す (Storage の容量を空けるため)
    import('../firebase/videos')
      .then((m) => m.deleteAllPrizeVideos(t.id))
      .catch((e) => console.warn('大会の動画を削除できませんでした', e));
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="headline">設定</h1>
      </div>

      <div className="cols-2">
      <section className="card">
        <h2 className="card-title">大会情報</h2>
        <Field label="大会名">
          <input className="input" value={t.name} onChange={(e) => updateCurrent((d) => void (d.name = e.target.value))} />
        </Field>
        <div className="field">
          <span className="field-label">日時</span>
          <DateTimeField value={t.date} onChange={(v) => updateCurrent((d) => void (d.date = v))} />
          <span className="field-hint">開始時刻・終了時刻（任意）は数字の入力か ↑↓ キーで 5 分ずつ。日付を消すと日時ごと消えます</span>
        </div>
        <Field label="説明・告知文の冒頭">
          <textarea
            className="input"
            rows={4}
            value={t.description}
            onChange={(e) => updateCurrent((d) => void (d.description = e.target.value))}
          />
        </Field>
        <span className="label">ロゴ</span>
        <p className="muted body-s">表彰画像の右上とホームに表示します。真剣勝負の大会は「BYリーグ」、エンジョイ大会は「InkParty」がおすすめです。</p>
        <div className="brand-picker" role="radiogroup" aria-label="ロゴ">
          {BRAND_OPTIONS.map((b) => (
            <button
              key={b.value}
              type="button"
              role="radio"
              aria-checked={t.rules.brand === b.value}
              className={`brand-option ${t.rules.brand === b.value ? 'selected' : ''}`}
              onClick={() => setRule('brand', b.value)}
            >
              <img src={b.image} alt="" width={96} height={96} />
              <span className="body-s">
                {t.rules.brand === b.value && <Icon name="check" />}
                {b.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">ルール</h2>
        <div className="form-row">
          <Field label="大会の種類" hint={kind.description}>
            <select className="input" value={t.rules.kind} onChange={(e) => setRule('kind', e.target.value as TournamentKind)}>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="1チームの人数">
            <input
              className="input"
              type="number"
              min={1}
              value={t.rules.teamSize}
              onChange={(e) => setRule('teamSize', Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>
        {/* 総当たりのみの大会はトーナメントがないので、BO 数は「大会の形式」のリーグ戦の試合で決める */}
        {!t.league?.only && (
          <div className="form-row">
            <Field label="通常の試合" hint="BO3 = 2本先取">
              <BestOfSelect value={t.rules.bestOf} onChange={(v) => setRule('bestOf', v)} />
            </Field>
            <Field label="決勝">
              <BestOfSelect value={t.rules.finalBestOf} onChange={(v) => setRule('finalBestOf', v)} />
            </Field>
          </div>
        )}
        {t.rules.kind === 'category' && (
          <>
            <h3 className="title-m">使えるカテゴリ</h3>
            <div className="chips">
              {CATEGORIES.map((c) => {
                const on = t.rules.categories.includes(c.id);
                return (
                  <FilterChip
                    key={c.id}
                    label={c.name}
                    color={c.color}
                    selected={on}
                    onClick={() =>
                      setRule('categories', on ? t.rules.categories.filter((x) => x !== c.id) : [...t.rules.categories, c.id])
                    }
                  />
                );
              })}
            </div>
            {t.rules.categories.length === 0 && <p className="supporting warn-text">カテゴリを 1 つ以上選んでください。</p>}
          </>
        )}
        {t.rules.kind === 'random' && (
          <>
            <h3 className="title-m">抽選</h3>
            <div className="form-row">
              <Field label="抽選のタイミング" hint="選手ごとに、レプリカを除く全ブキから抽選します">
                <select
                  className="input"
                  value={t.rules.randomTiming}
                  onChange={(e) => setRule('randomTiming', e.target.value as RandomTiming)}
                >
                  {(Object.keys(RANDOM_TIMING_LABEL) as RandomTiming[]).map((k) => (
                    <option key={k} value={k}>
                      {RANDOM_TIMING_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="muted body-s">
              ゲームごと・試合ごとは試合記録の画面で、大会で 1 回はチーム画面で抽選します。抽選結果は全員の画面に共有されます。
            </p>
          </>
        )}
        {kind.hasPool && (
          <>
            <h3 className="title-m">候補ブキ</h3>
            <div className="form-row">
              <Field label="候補の単位" hint="メイン単位: ボールドマーカー系のようにマイナーチェンジをまとめて登録">
                <select className="input" value={t.rules.poolUnit} onChange={(e) => setPoolUnit(e.target.value as PoolUnit)}>
                  <option value="main">メイン単位</option>
                  <option value="weapon">ブキ単位</option>
                </select>
              </Field>
              <Field label="候補ブキの登録上限" hint="0 で無制限">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={t.rules.poolMax}
                  onChange={(e) => setRule('poolMax', Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
              <Field label="ブキの再使用">
                <select className="input" value={t.rules.reuse} onChange={(e) => setRule('reuse', e.target.value as ReuseRule)}>
                  <option value="free">制限なし</option>
                  <option value="match">同じ試合内では再使用不可</option>
                  <option value="tournament">大会を通して再使用不可</option>
                </select>
              </Field>
            </div>
            <Switch
              label="他チームと同じ候補ブキを登録してよい"
              checked={t.rules.allowDuplicate}
              onChange={(v) => setRule('allowDuplicate', v)}
            />
          </>
        )}
      </section>
      </div>

      <LeagueSettings t={t} />

      <div className="cols-2">

      <section className="card">
        <h2 className="card-title">大会の管理</h2>
        <p className="muted body-s">
          大会・選手 DB は全員で共通です。ここでの作成・削除はほかの運営メンバーの画面にもすぐ反映されます。
          <br />
          登録済み（{app.tournaments.length}）: {app.tournaments.map((x) => x.name).join(' / ')}
        </p>
        <div className="button-stack">
          <button className="btn tonal" onClick={createTournament}>
            <Icon name="add" />
            新しい大会
          </button>
          <button className="btn outlined" onClick={duplicate}>
            <Icon name="content_copy" />
            この大会を複製（チーム・ルールを引き継ぐ）
          </button>
          <button className="btn text danger" onClick={remove}>
            <Icon name="delete" />
            この大会を削除
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">データ</h2>
        <p className="muted body-s">
          データはオンライン（Firebase）に 1 つだけあり、全員が同じものを見ています。変更は自動で保存され、ほかの画面にもすぐ反映されます。
          万一に備えて、大会の前後にバックアップを保存しておくと安心です（復元が必要なときは開発者に依頼してください）。
        </p>
        <div className="button-stack">
          <button className="btn outlined" onClick={() => download(`by-splatoon_backup_${today()}.json`, backupJson())}>
            <Icon name="download" />
            全データのバックアップを保存
          </button>
        </div>
      </section>
      </div>

      <p className="muted body-s">
        ブキデータ: {WEAPONS.length} 種（ゲームデータ Ver.{WEAPON_DATA_VERSION.slice(0, -2)}.{WEAPON_DATA_VERSION.slice(-2, -1)}.{WEAPON_DATA_VERSION.slice(-1)} 時点）
      </p>
    </div>
  );
}

function BestOfSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {[1, 3, 5, 7].map((n) => (
        <option key={n} value={n}>
          BO{n}（{Math.floor(n / 2) + 1}本先取）
        </option>
      ))}
    </select>
  );
}

type Format = 'bracket' | 'league' | 'leagueOnly';

const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: 'bracket', label: 'トーナメントのみ', hint: 'シングルエリミネーションのトーナメント' },
  { value: 'league', label: '予選リーグ → 本選トーナメント', hint: 'グループごとの総当たりの上位で本選トーナメントをする' },
  { value: 'leagueOnly', label: '総当たりのみ（リーグ戦）', hint: '全チーム総当たりの順位で優勝を決める。チーム数が少ない大会向け' },
];

const formatOf = (t: Tournament): Format => (!t.league ? 'bracket' : t.league.only ? 'leagueOnly' : 'league');

/** 大会の形式 (トーナメント / 予選リーグ → 本選 / 総当たりのみ) と、リーグの進出数・BO 数・順位の決め方 (グループ分けはリーグのページで編集) */
function LeagueSettings({ t }: { t: Tournament }) {
  const league = t.league;
  const format = formatOf(t);
  const setFormat = (next: Format) => {
    if (next === format) return;
    if (next === 'bracket' && league && Object.keys(league.matches).length && !confirm('リーグ戦をなくしますか？\nリーグ戦の試合結果はすべて消えます。')) return;
    updateCurrent((d) => {
      if (next === 'bracket') d.league = null;
      // 予選リーグ ⇔ 総当たりのみ の切り替えは、グループ分けと試合結果をそのまま使う
      else if (d.league) {
        d.league.only = next === 'leagueOnly';
        // まだ試合をしていなければ、総当たりのみは全チーム 1 グループにする
        if (d.league.only && !Object.keys(d.league.matches).length) d.league.groups = makeGroups(d.teams.map((x) => x.id), 1);
      }
      else d.league = newLeague(d.teams.map((x) => x.id), 2, next === 'leagueOnly');
    });
  };
  const set = (fn: (l: NonNullable<Tournament['league']>) => void) => updateCurrent((d) => void (d.league && fn(d.league)));
  const unused = TIEBREAKERS.filter((k) => !league?.tiebreakers.includes(k));
  const moveTiebreaker = (i: number, delta: number) =>
    set((l) => {
      const j = i + delta;
      if (j < 0 || j >= l.tiebreakers.length) return;
      [l.tiebreakers[i], l.tiebreakers[j]] = [l.tiebreakers[j], l.tiebreakers[i]];
    });
  return (
    <section className="card">
      <h2 className="card-title">大会の形式</h2>
      <div className="format-options" role="radiogroup" aria-label="大会の形式">
        {FORMATS.map((f) => (
          <label key={f.value} className={`format-option ${format === f.value ? 'selected' : ''}`}>
            <input type="radio" name="format" checked={format === f.value} onChange={() => setFormat(f.value)} />
            <span>
              <span className="title-m">{f.label}</span>
              <span className="muted body-s">{f.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {league && (
        <>
          <div className="form-row">
            {!league.only && (
              <Field label="各グループから本選に進むチーム数">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={league.advance}
                  onChange={(e) => set((l) => void (l.advance = Math.max(1, Number(e.target.value) || 1)))}
                />
              </Field>
            )}
            <Field label={league.only ? 'リーグ戦の試合' : '予選の試合'}>
              <BestOfSelect value={league.bestOf} onChange={(v) => set((l) => void (l.bestOf = v))} />
            </Field>
          </div>
          <div className="row">
            <span className="label">順位の決め方（上から順に比べる）</span>
            <span className="spacer" />
            <button
              className="btn text"
              disabled={league.tiebreakers.join() === TAIKAI_SUPPORT_TIEBREAKERS.join()}
              onClick={() => set((l) => void (l.tiebreakers = [...TAIKAI_SUPPORT_TIEBREAKERS]))}
            >
              <Icon name="restart_alt" />
              タイカイサポートと同じにする
            </button>
          </div>
          <ol className="tiebreakers">
            {league.tiebreakers.map((k, i) => (
              <li key={k}>
                <span>{TIEBREAKER_LABEL[k]}</span>
                <IconButton icon="arrow_upward" label="上へ" onClick={() => moveTiebreaker(i, -1)} />
                <IconButton icon="arrow_downward" label="下へ" onClick={() => moveTiebreaker(i, 1)} />
                <IconButton
                  icon="close"
                  label="使わない"
                  onClick={() => set((l) => void (l.tiebreakers = l.tiebreakers.filter((x) => x !== k)))}
                />
              </li>
            ))}
          </ol>
          {unused.length > 0 && (
            <Field label="決め方を追加">
              <select
                className="input"
                value=""
                onChange={(e) => e.target.value && set((l) => void l.tiebreakers.push(e.target.value as Tiebreaker))}
              >
                <option value="">（選ぶと一番下に追加）</option>
                {unused.map((k) => (
                  <option key={k} value={k}>
                    {TIEBREAKER_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="muted body-s">
            既定はタイカイサポートの優先勝利条件（勝利試合数 → 勝利バトル数 → 負けバトル数の少なさ → 直接対決 → エントリー番号順）です。
            直接対決は、並んだチーム同士の試合だけで比べます。エントリー番号はチーム一覧の並び順です（これを入れると同順位は出ません）。
            グループ分けは<a href="#/league">{league.only ? 'リーグ戦' : '予選'}ページ</a>で編集できます。
          </p>
        </>
      )}
    </section>
  );
}
