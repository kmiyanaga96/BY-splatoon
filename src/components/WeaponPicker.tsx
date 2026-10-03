import { useMemo, useState, type CSSProperties } from 'react';
import { CATEGORIES, MAINS, WEAPONS, mainMatchesQuery, matchesQuery, weaponKit } from '../data/weapons';
import type { PoolUnit } from '../types';
import { FilterChip, Icon, Modal, Switch, WeaponIcon, WeaponTag } from './ui';

interface Props {
  title: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  /** 選択上限 (0 で無制限) */
  max?: number;
  /** ブキごとの補足表示 (例: 他チームが登録済み) */
  notes?: Map<string, string>;
  /** 選択できないブキ */
  disabled?: Set<string>;
  /** main ならメイン (マイナーチェンジをまとめたもの) を選ぶ */
  unit?: PoolUnit;
}

/** 検索・カテゴリ絞り込み付きのブキ (メイン) 複数選択 */
export function WeaponPicker(props: Props) {
  const { selected, max = 0, unit = 'weapon' } = props;
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [showReplica, setShowReplica] = useState(false);

  const list = useMemo(
    () =>
      unit === 'main'
        ? MAINS.filter((m) => (!cat || m.category === cat) && mainMatchesQuery(m, query))
        : WEAPONS.filter(
            (w) =>
              (showReplica || !w.replica || selected.includes(w.id)) &&
              (!cat || w.category === cat) &&
              matchesQuery(w, query),
          ),
    [unit, query, cat, showReplica, selected],
  );

  const full = max > 0 && selected.length >= max;
  const toggle = (id: string) => {
    if (selected.includes(id)) props.onChange(selected.filter((x) => x !== id));
    else if (!full) props.onChange([...selected, id]);
  };

  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      wide
      actions={
        <button className="btn filled" onClick={props.onClose}>
          完了
        </button>
      }
    >
      <div className="picker-selected">
        <span className="label">
          選択中 {selected.length}
          {max > 0 && ` / ${max}`}
        </span>
        {selected.map((id) => (
          <WeaponTag key={id} id={id} onRemove={() => toggle(id)} />
        ))}
      </div>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            className="input"
            placeholder="ブキ名・サブ・スペシャルで検索（ひらがな可）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        {unit === 'weapon' && <Switch label="レプリカも表示" checked={showReplica} onChange={setShowReplica} />}
      </div>
      <div className="chips">
        <FilterChip label="すべて" selected={cat === null} onClick={() => setCat(null)} />
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.id}
            label={c.name}
            color={c.color}
            selected={cat === c.id}
            onClick={() => setCat(cat === c.id ? null : c.id)}
          />
        ))}
      </div>
      {full && (
        <p className="supporting warn-text">
          <Icon name="info" /> 登録上限（{max}）に達しています。外してから選び直してください。
        </p>
      )}
      {unit === 'main' && <p className="supporting">メイン単位で選びます。マイナーチェンジ（同じメインのブキ）はどれでも使えます。</p>}
      <div className="picker-grid">
        {list.map((w) => {
          const on = selected.includes(w.id);
          const color = CATEGORIES.find((c) => c.id === w.category)?.color;
          const note = props.notes?.get(w.id);
          const disabled = !on && (full || !!props.disabled?.has(w.id));
          return (
            <button
              key={w.id}
              className={`picker-item ${on ? 'on' : ''}`}
              style={{ '--c': color } as CSSProperties}
              onClick={() => toggle(w.id)}
              disabled={disabled}
              aria-pressed={on}
            >
              <WeaponIcon id={w.id} size={44} />
              <span className="picker-text">
                <span className="picker-name">
                  {on && <Icon name="check" />}
                  {w.name}
                </span>
                <span className="picker-kit">{weaponKit(w.id)}</span>
                {note && <span className="picker-note">{note}</span>}
              </span>
            </button>
          );
        })}
        {list.length === 0 && <p className="muted">該当するブキがありません</p>}
      </div>
    </Modal>
  );
}
