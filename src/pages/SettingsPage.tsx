import { useRef } from 'react';
import { Field } from '../components/ui';
import { WEAPON_DATA_VERSION, WEAPONS } from '../data/weapons';
import { exportJson, importJson, newId, newTournament, normalizeData, setState, update, updateCurrent, useApp } from '../store';
import type { ReuseRule, Rules, Tournament } from '../types';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_') || 'tournament';
const today = () => new Date().toISOString().slice(0, 10);

export function SettingsPage({ t }: { t: Tournament }) {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const setRule = <K extends keyof Rules>(k: K, v: Rules[K]) => updateCurrent((d) => void (d.rules[k] = v));

  const addTournament = () => {
    const nt = newTournament();
    update((d) => {
      d.tournaments.push(nt);
      d.currentId = nt.id;
    });
  };

  const duplicate = () => {
    // チーム・ルールはそのまま、トーナメント表は空にして複製 (次回大会の下準備用)
    const copy: Tournament = { ...structuredClone(t), id: newId(), name: `${t.name} のコピー`, bracket: { slots: [], matches: {} } };
    update((d) => {
      d.tournaments.push(copy);
      d.currentId = copy.id;
    });
  };

  const remove = () => {
    if (!confirm(`大会「${t.name}」を削除しますか？この操作は取り消せません。`)) return;
    update((d) => {
      d.tournaments = d.tournaments.filter((x) => x.id !== t.id);
      if (d.tournaments.length === 0) d.tournaments.push(newTournament('ブキ統一杯'));
      d.currentId = d.tournaments[0].id;
    });
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const ids = importJson(await file.text());
      alert(`${ids.length} 件の大会を読み込みました（同じ大会があれば上書きしました）。`);
    } catch (e) {
      alert(`読み込みに失敗しました: ${e instanceof Error ? e.message : e}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resetAll = () => {
    if (!confirm('すべての大会データを削除して初期状態に戻しますか？\n先にバックアップ（全データ書き出し）をおすすめします。')) return;
    setState(normalizeData(null));
  };

  return (
    <div className="stack">
      <h1>設定</h1>

      <section className="card">
        <h2>大会情報</h2>
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
        <h2>ブキ統一ルール</h2>
        <div className="form-row">
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
          <label className="check">
            <input
              type="checkbox"
              checked={t.rules.allowDuplicate}
              onChange={(e) => setRule('allowDuplicate', e.target.checked)}
            />
            他チームと同じ候補ブキを登録してよい
          </label>
        </div>
      </section>

      <section className="card">
        <h2>大会の管理</h2>
        <p className="muted small">登録済み: {app.tournaments.map((x) => x.name).join(' / ')}</p>
        <div className="row">
          <button className="btn" onClick={addTournament}>
            ＋ 新しい大会
          </button>
          <button className="btn" onClick={duplicate}>
            この大会を複製（チーム・ルールを引き継ぐ）
          </button>
          <button className="btn danger" onClick={remove}>
            この大会を削除
          </button>
        </div>
      </section>

      <section className="card">
        <h2>データの保存・共有</h2>
        <p className="muted small">
          データはこのブラウザ内（localStorage）に自動保存されます。別の端末や運営メンバーに渡すときは JSON ファイルに書き出して、相手の画面で読み込んでください。
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => download(`${safeName(t.name)}_${today()}.json`, exportJson([t]))}>
            この大会を書き出し
          </button>
          <button className="btn" onClick={() => download(`by-splatoon_all_${today()}.json`, exportJson(app.tournaments))}>
            全データを書き出し
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            JSON を読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onImport(e.target.files?.[0])}
          />
          <span className="spacer" />
          <button className="btn danger" onClick={resetAll}>
            全データを初期化
          </button>
        </div>
      </section>

      <p className="muted small">
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
