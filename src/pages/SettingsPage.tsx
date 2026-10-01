import { useRef, useState } from 'react';
import { Field, Icon, Switch } from '../components/ui';
import { WEAPON_DATA_VERSION, WEAPONS } from '../data/weapons';
import { emptyData } from '../model';
import { loadLocalSync } from '../storage/local';
import { exportJson, importData, importJson, isLocalStorage, newId, newTournament, setState, storageName, update, updateCurrent, useApp, useCanEdit } from '../store';
import type { ReuseRule, Rules, Tournament } from '../types';

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

/** オンラインへの取り込みが済んだら、案内を出さないようにする (元データは残す) */
const MIGRATED_KEY = 'by-splatoon:migrated-to-firebase';
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* 覚えられなくても動作に支障はない */
  }
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

  const canEdit = useCanEdit();
  const [migrated, setMigrated] = useState(() => readFlag(MIGRATED_KEY));
  const localRaw = isLocalStorage() || migrated ? null : (loadLocalSync() as any);
  const localData =
    localRaw && Array.isArray(localRaw.tournaments)
      ? {
          tournaments: localRaw.tournaments.length,
          players: Array.isArray(localRaw.players)
            ? localRaw.players.length
            : localRaw.tournaments.reduce((n: number, t: any) => n + (t?.teams ?? []).reduce((m: number, x: any) => m + (x?.players?.length ?? 0), 0), 0),
        }
      : null;

  const migrateLocal = () => {
    if (!confirm('このブラウザに保存されていたデータをオンラインに取り込みますか？')) return;
    try {
      const ids = importData(localRaw);
      writeFlag(MIGRATED_KEY);
      setMigrated(true);
      alert(`${ids.length} 件の大会を取り込みました。（このブラウザの元データは消さずに残しています）`);
    } catch (e) {
      alert(`取り込めませんでした: ${e instanceof Error ? e.message : e}`);
    }
  };

  const resetAll = () => {
    if (!confirm('すべての大会データと選手 DB を削除して初期状態に戻しますか？\n先にバックアップ（全データ書き出し）をおすすめします。')) return;
    setState(emptyData());
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
        <p className="muted body-s">登録済み: {app.tournaments.map((x) => x.name).join(' / ')}</p>
        <div className="button-stack">
          <button className="btn tonal" onClick={addTournament}>
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
        <h2 className="card-title">データの保存・共有</h2>
        <p className="muted body-s">
          保存先: {storageName()}。変更は自動で保存されます。別の端末や運営メンバーに渡すときは JSON
          ファイルに書き出して、相手の画面で読み込んでください（大会に出ている選手の情報も一緒に書き出されます）。
        </p>
        <div className="button-stack">
          <button className="btn filled" onClick={() => download(`${safeName(t.name)}_${today()}.json`, exportJson([t]))}>
            <Icon name="download" />
            この大会を書き出し
          </button>
          <button className="btn outlined" onClick={() => download(`by-splatoon_all_${today()}.json`, exportJson(app.tournaments, true))}>
            <Icon name="download" />
            全データを書き出し
          </button>
          <button className="btn outlined" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" />
            JSON を読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onImport(e.target.files?.[0])}
          />
          {isLocalStorage() ? (
            <button className="btn text danger" onClick={resetAll}>
              <Icon name="restart_alt" />
              全データを初期化
            </button>
          ) : (
            localData && (
              <button className="btn tonal" onClick={migrateLocal} disabled={!canEdit}>
                <Icon name="upload" />
                このブラウザに保存されていたデータをオンラインに取り込む
              </button>
            )
          )}
        </div>
        {!isLocalStorage() && localData && (
          <p className="muted body-s">
            このブラウザには、オンライン化する前のデータ（大会 {localData.tournaments} 件・選手 {localData.players} 人）が残っています。
            取り込むと、同じ大会・選手は上書きされ、名前が同じ選手は 1 人にまとめられます。
          </p>
        )}
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
