import { Field, Icon, Switch } from '../components/ui';
import { WEAPON_DATA_VERSION, WEAPONS } from '../data/weapons';
import { convertPool } from '../model';
import { backupJson, createTournament, newId, update, updateCurrent, useApp } from '../store';
import type { PoolUnit, ReuseRule, Rules, Tournament } from '../types';

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
  const setRule = <K extends keyof Rules>(k: K, v: Rules[K]) => updateCurrent((d) => void (d.rules[k] = v));
  // 単位を変えたら登録済みの候補もそろえる (ブキ→メインはまとめる、メイン→ブキは代表ブキにする)
  const setPoolUnit = (unit: PoolUnit) =>
    updateCurrent((d) => {
      d.rules.poolUnit = unit;
      for (const team of d.teams) team.pool = convertPool(team.pool, unit);
    });

  const duplicate = () => {
    // チーム・ルールはそのまま、トーナメント表は空にして複製 (次回大会の下準備用)
    const copy: Tournament = { ...structuredClone(t), id: newId(), name: `${t.name} のコピー`, bracket: { slots: [], matches: {} } };
    update((d) => {
      d.tournaments.push(copy);
      d.currentId = copy.id;
    });
  };

  const remove = () => {
    if (!confirm(`大会「${t.name}」を削除しますか？\n全員の画面から消え、取り消せません。`)) return;
    update((d) => {
      d.tournaments = d.tournaments.filter((x) => x.id !== t.id);
      d.currentId = d.tournaments.at(-1)?.id ?? '';
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="headline">設定</h1>
      </div>

      <div className="cols-2">
      <section className="card">
        <h2 className="card-title">大会情報</h2>
        <div className="form-row">
          <Field label="大会名">
            <input className="input" value={t.name} onChange={(e) => updateCurrent((d) => void (d.name = e.target.value))} />
          </Field>
          <Field label="日時" hint="自由記述 (例: 10/12(日) 21:00〜)">
            <input className="input" value={t.date} onChange={(e) => updateCurrent((d) => void (d.date = e.target.value))} />
          </Field>
        </div>
        <Field label="説明・告知文の冒頭">
          <textarea
            className="input"
            rows={4}
            value={t.description}
            onChange={(e) => updateCurrent((d) => void (d.description = e.target.value))}
          />
        </Field>
      </section>

      <section className="card">
        <h2 className="card-title">ブキ統一ルール</h2>
        <div className="form-row">
          <Field label="候補の単位" hint="メイン単位ならマイナーチェンジも同じメインとして使える">
            <select className="input" value={t.rules.poolUnit} onChange={(e) => setPoolUnit(e.target.value as PoolUnit)}>
              <option value="main">メイン単位（例: ボールドマーカー系）</option>
              <option value="weapon">ブキ単位（マイナーチェンジは別ブキ）</option>
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
        <div className="form-row">
          <Field label="通常の試合" hint="BO3 = 2本先取">
            <BestOfSelect value={t.rules.bestOf} onChange={(v) => setRule('bestOf', v)} />
          </Field>
          <Field label="決勝">
            <BestOfSelect value={t.rules.finalBestOf} onChange={(v) => setRule('finalBestOf', v)} />
          </Field>
        </div>
        <Switch
          label="他チームと同じ候補ブキを登録してよい"
          checked={t.rules.allowDuplicate}
          onChange={(v) => setRule('allowDuplicate', v)}
        />
      </section>
      </div>

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
