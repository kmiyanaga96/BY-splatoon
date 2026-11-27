import { useEffect, useMemo, useState } from 'react';
import { CopyButton, Empty, FilterChip, Icon, IconButton, Modal, Segmented, WeaponIcon } from '../components/ui';
import { WeaponPicker } from '../components/WeaponPicker';
import { getWeapon, weaponKit } from '../data/weapons';
import { CHECKER_RULES, checkComp, checkText, compName, type CheckerRule } from '../lib/checker';
import { newPlayer, update, updatePlayer, useApp, useCanEdit } from '../store';
import type { Player } from '../types';

const KEY = 'by-splatoon:checker';

interface Slot {
  weapon: string | null;
  /** 身内メンバー (Player.id) */
  player: string | null;
}

interface Saved {
  rule: CheckerRule;
  slots: Slot[];
}

const EMPTY: Slot[] = Array.from({ length: 4 }, () => ({ weapon: null, player: null }));

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
    return {
      rule: CHECKER_RULES.includes(s.rule as CheckerRule) ? (s.rule as CheckerRule) : 'エリア',
      slots: Array.isArray(s.slots) && s.slots.length === 4 ? s.slots.map((x) => ({ weapon: x?.weapon ?? null, player: x?.player ?? null })) : EMPTY,
    };
  } catch {
    return { rule: 'エリア', slots: EMPTY };
  }
}

/** 身内メンバー (並び順 → 名前順) */
function useCrew(): Player[] {
  const players = useApp().players;
  return useMemo(
    () => players.filter((p) => typeof p.crew === 'number').sort((a, b) => a.crew! - b.crew! || a.name.localeCompare(b.name, 'ja')),
    [players],
  );
}

/**
 * 編成チェッカー (ツールモード)。ルールと味方 4 人のブキから、編成のバランスと勝ち筋を出して Discord に共有する。
 * 入力はこの端末に覚えるだけで保存しない。身内メンバー (選手 DB) から得意ブキを 1 タップで入れられる
 */
export function CheckerPage() {
  const [s, setS] = useState<Saved>(load);
  const [active, setActive] = useState(0);
  const [picking, setPicking] = useState<number | null>(null);
  const [editingCrew, setEditingCrew] = useState(false);
  const app = useApp();
  const crew = useCrew();
  const canEdit = useCanEdit();
  const byId = useMemo(() => new Map(app.players.map((p) => [p.id, p])), [app.players]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* 覚えられなくても使える */
    }
  }, [s]);

  const weapons = s.slots.map((x) => x.weapon);
  const names = s.slots.map((x) => (x.player ? (byId.get(x.player)?.name ?? null) : null));
  const result = useMemo(() => checkComp(weapons, s.rule), [weapons.join(), s.rule]); // eslint-disable-line react-hooks/exhaustive-deps
  const setSlot = (i: number, patch: Partial<Slot>) => setS((x) => ({ ...x, slots: x.slots.map((sl, k) => (k === i ? { ...sl, ...patch } : sl)) }));
  const next = (from: number) => {
    const k = s.slots.findIndex((sl, i) => i > from && !sl.weapon);
    setActive(k >= 0 ? k : Math.min(from + 1, 3));
  };

  /** メンバーを選んだ枠に入れる。得意ブキが 1 つならそのブキも入れる */
  const pickMember = (p: Player) => {
    const i = active;
    const keep = s.slots[i].weapon && p.mains.includes(s.slots[i].weapon!) ? s.slots[i].weapon : null;
    const weapon = p.mains.length === 1 ? p.mains[0] : keep;
    setSlot(i, { player: p.id, weapon });
    if (weapon) next(i);
  };
  const pickWeapon = (i: number, id: string) => {
    setSlot(i, { weapon: id });
    next(i);
  };

  const ready = result.count === 4;
  const text = result.count ? checkText(weapons, names, s.rule, result) : '';
  const objLabel = { エリア: 'エリア', ヤグラ: 'ヤグラ', ホコ: 'ホコ', アサリ: 'アサリ' }[s.rule];

  return (
    <div className="page checker-page">
      <div className="page-header row">
        <h1 className="headline">編成チェッカー</h1>
        <span className="spacer" />
        <button
          className="btn text"
          disabled={!s.slots.some((x) => x.weapon || x.player)}
          onClick={() => {
            setS((x) => ({ ...x, slots: EMPTY }));
            setActive(0);
          }}
        >
          <Icon name="restart_alt" />
          クリア
        </button>
        {text && <CopyButton text={text} label="Discord 用にコピー" variant="filled" />}
      </div>

      <Segmented value={s.rule} onChange={(rule) => setS((x) => ({ ...x, rule }))} options={CHECKER_RULES.map((r) => ({ value: r, label: r }))} />

      <section className="card checker-crew">
        <div className="row">
          <h2 className="card-title">メンバー</h2>
          <span className="spacer" />
          {canEdit && (
            <button className="btn text" onClick={() => setEditingCrew(true)}>
              <Icon name="edit" />
              メンバーを編集
            </button>
          )}
        </div>
        {crew.length ? (
          <div className="chips">
            {crew.map((p) => (
              <FilterChip key={p.id} label={p.name || '（名前なし）'} selected={s.slots.some((x) => x.player === p.id)} onClick={() => pickMember(p)} />
            ))}
          </div>
        ) : (
          <p className="muted body-s">身内メンバーが未登録です{canEdit ? '（「メンバーを編集」から登録）' : ''}。ブキは各枠から直接選べます。</p>
        )}
      </section>

      <div className="checker-slots">
        {s.slots.map((sl, i) => {
          const p = sl.player ? byId.get(sl.player) : undefined;
          const w = sl.weapon ? getWeapon(sl.weapon) : undefined;
          const rank = result.objectRank.indexOf(i);
          return (
            <section key={i} className={`card checker-slot ${active === i ? 'active' : ''}`} onClick={() => setActive(i)}>
              <div className="checker-slot-head">
                <span className="checker-slot-no">{i + 1}</span>
                <span className="checker-slot-name">{p?.name ?? <span className="muted">メンバー未選択</span>}</span>
                {rank >= 0 && rank < 2 && <span className="badge">{objLabel} {rank + 1}</span>}
                {(sl.player || sl.weapon) && (
                  <IconButton
                    icon="close"
                    label={`${i + 1} 人目を空にする`}
                    onClick={() => {
                      setSlot(i, { player: null, weapon: null });
                      setActive(i);
                    }}
                  />
                )}
              </div>
              <button
                className="checker-weapon"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(i);
                  setPicking(i);
                }}
              >
                {w ? (
                  <>
                    <WeaponIcon id={w.id} size={56} />
                    <span className="checker-weapon-name">{w.name}</span>
                    <span className="muted body-s">{weaponKit(w.id)}</span>
                  </>
                ) : (
                  <>
                    <Icon name="add" />
                    <span className="muted">ブキを選ぶ</span>
                  </>
                )}
              </button>
              {p && p.mains.length > 1 && (
                <div className="checker-mains">
                  {p.mains.map((id) => (
                    <button
                      key={id}
                      className={`checker-main ${sl.weapon === id ? 'selected' : ''}`}
                      title={getWeapon(id)?.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        pickWeapon(i, id);
                      }}
                    >
                      <WeaponIcon id={id} size={32} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="card checker-result">
        <div className="row">
          <h2 className="card-title">{result.count ? compName(weapons, s.rule) : '編成バランス'}</h2>
        </div>
        {result.count === 0 ? (
          <Empty icon="groups">ブキを選ぶと、編成のバランスと勝ち筋が出ます</Empty>
        ) : (
          <>
            <div className="checker-gauges">
              {result.gauges.map((g) => (
                <div key={g.key} className="checker-gauge">
                  <span className="checker-gauge-label">{g.label}</span>
                  <span className="checker-gauge-bar">
                    <span style={{ width: `${((g.value ?? 0) / 5) * 100}%` }} className={g.value !== null && g.value <= 2.5 ? 'low' : g.value !== null && g.value >= 4 ? 'high' : ''} />
                  </span>
                  <span className="checker-gauge-value">{g.value === null ? '-' : g.value.toFixed(1)}</span>
                </div>
              ))}
              <div className="checker-gauge">
                <span className="checker-gauge-label">射程</span>
                <span className="checker-gauge-bar">
                  <span style={{ width: `${Math.min(1, (result.maxRange ?? 0) / 6.5) * 100}%` }} />
                </span>
                <span className="checker-gauge-value">{result.maxRange === null ? '-' : result.maxRange.toFixed(1)}</span>
              </div>
            </div>
            <p className="muted body-s">評価は 4 人の平均（1〜5）、射程は最長の有効射程（ライン本数）{result.avgRange !== null && `。平均射程 ${result.avgRange.toFixed(1)}`}</p>
            {ready ? (
              <ul className="checker-advice">
                {result.advice.map((a, k) => (
                  <li key={k} className={a.kind}>
                    <Icon name={a.kind === 'warn' ? 'warning' : a.kind === 'good' ? 'check_circle' : 'flag'} />
                    {a.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted body-s">4 人そろうと勝ち筋を出します</p>
            )}
          </>
        )}
      </section>

      {picking !== null && (
        <WeaponPicker
          title={`${picking + 1} 人目のブキ`}
          selected={s.slots[picking].weapon ? [s.slots[picking].weapon!] : []}
          onChange={(ids) => {
            const id = ids.find((x) => x !== s.slots[picking].weapon) ?? ids[0];
            if (id) pickWeapon(picking, id);
            else setSlot(picking, { weapon: null });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
          max={2}
        />
      )}
      {editingCrew && <CrewEditor crew={crew} onClose={() => setEditingCrew(false)} />}
    </div>
  );
}

/** 身内メンバーの編集 (編集者だけ)。選手 DB の選手に「身内」の印と並び順を付ける */
function CrewEditor(props: { crew: Player[]; onClose: () => void }) {
  const { crew } = props;
  const app = useApp();
  const [adding, setAdding] = useState('');
  const [newName, setNewName] = useState('');
  const [mainsOf, setMainsOf] = useState<Player | null>(null);
  const others = app.players.filter((p) => typeof p.crew !== 'number').sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const last = crew.length ? Math.max(...crew.map((p) => p.crew!)) + 1 : 0;

  /** 並び順を 0, 1, 2… に振り直す */
  const reorder = (ids: string[]) =>
    update((d) => {
      for (const p of d.players) {
        const k = ids.indexOf(p.id);
        if (k >= 0) p.crew = k;
      }
    });
  const move = (i: number, d: number) => {
    const ids = crew.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    reorder(ids);
  };

  return (
    <Modal title="身内メンバー" onClose={props.onClose}>
      <p className="muted body-s">選手 DB の選手から選びます。得意ブキ（3〜5 個）を登録しておくと、編成チェッカーで 1 タップで入れられます。</p>
      <ul className="crew-list">
        {crew.map((p, i) => (
          <li key={p.id}>
            <span className="crew-name">{p.name || '（名前なし）'}</span>
            <span className="crew-mains">
              {p.mains.map((id) => (
                <WeaponIcon key={id} id={id} size={28} />
              ))}
            </span>
            <button className="btn text" onClick={() => setMainsOf(p)}>
              得意ブキ
            </button>
            <IconButton icon="arrow_upward" label="上へ" onClick={() => move(i, -1)} disabled={i === 0} />
            <IconButton icon="arrow_downward" label="下へ" onClick={() => move(i, 1)} disabled={i === crew.length - 1} />
            <IconButton icon="close" label="身内から外す" onClick={() => updatePlayer(p.id, (x) => void delete x.crew)} />
          </li>
        ))}
      </ul>
      <div className="row crew-add">
        <select className="input" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="追加する選手">
          <option value="">選手 DB から追加…</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || '（名前なし）'}
            </option>
          ))}
        </select>
        <button
          className="btn tonal"
          disabled={!adding}
          onClick={() => {
            updatePlayer(adding, (x) => void (x.crew = last));
            setAdding('');
          }}
        >
          追加
        </button>
      </div>
      <div className="row crew-add">
        <input className="input" placeholder="選手 DB にない人を新しく登録" maxLength={100} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button
          className="btn tonal"
          disabled={!newName.trim()}
          onClick={() => {
            const p = { ...newPlayer(newName.trim()), crew: last };
            update((d) => void d.players.push(p));
            setNewName('');
          }}
        >
          登録
        </button>
      </div>
      <p className="muted body-s">
        アイコン・Xパワーなどは<a href="#/players">選手ページ</a>で編集できます。
      </p>
      {mainsOf && (
        <WeaponPicker
          title={`${mainsOf.name} の得意ブキ`}
          selected={app.players.find((p) => p.id === mainsOf.id)?.mains ?? []}
          onChange={(ids) => updatePlayer(mainsOf.id, (x) => void (x.mains = ids))}
          onClose={() => setMainsOf(null)}
          max={10}
        />
      )}
    </Modal>
  );
}
