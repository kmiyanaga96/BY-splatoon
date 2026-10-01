// Material Design 3 に沿った共通 UI 部品

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { categoryOf, getWeapon, weaponName } from '../data/weapons';
import { xBadgeUrl, xTier } from '../lib/xbadge';

/** Material Symbols のアイコン。使う名前は index.html の icon_names にも追加すること */
export function Icon(props: { name: string; filled?: boolean; className?: string }) {
  return (
    <span className={`icon ${props.filled ? 'filled' : ''} ${props.className ?? ''}`} aria-hidden="true">
      {props.name}
    </span>
  );
}

export function IconButton(props: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${props.danger ? 'danger' : ''} ${props.selected ? 'selected' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
    >
      <Icon name={props.icon} filled={props.selected} />
    </button>
  );
}

/** M3 Dialog。actions はダイアログ下部の右寄せボタン列 */
export function Modal(props: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${props.wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="dialog-head">
          <h2 className="dialog-title">{props.title}</h2>
          <IconButton icon="close" label="閉じる" onClick={onClose} />
        </div>
        <div className="dialog-body">{props.children}</div>
        {props.actions && <div className="dialog-actions">{props.actions}</div>}
      </div>
    </div>
  );
}

export function WeaponTag(props: { id: string; state?: 'used' | 'out' | 'warn'; note?: string; onRemove?: () => void }) {
  const w = getWeapon(props.id);
  const cat = categoryOf(props.id);
  const title = w ? `${w.name}\nサブ: ${w.sub}\nスペシャル: ${w.special} (${w.sp}p)` : props.id;
  return (
    <span className={`wtag ${props.state ?? ''}`} style={{ '--c': cat?.color ?? '#888' } as CSSProperties} title={title}>
      {weaponName(props.id)}
      {props.note && <small className="wtag-note">{props.note}</small>}
      {props.onRemove && (
        <button className="wtag-x" onClick={props.onRemove} aria-label={`${weaponName(props.id)}を外す`}>
          <Icon name="close" />
        </button>
      )}
    </span>
  );
}

export function TeamName(props: { name: string; color: string; big?: boolean }) {
  return (
    <span className={`team-name ${props.big ? 'big' : ''}`}>
      <span className="team-dot" style={{ background: props.color }} />
      {props.name}
    </span>
  );
}

// ---- Snackbar ----

let snack: { id: number; text: string } | null = null;
const snackListeners = new Set<() => void>();

export function showSnackbar(text: string) {
  const id = Date.now();
  snack = { id, text };
  snackListeners.forEach((l) => l());
  setTimeout(() => {
    if (snack?.id !== id) return;
    snack = null;
    snackListeners.forEach((l) => l());
  }, 2500);
}

export function SnackbarHost() {
  const current = useSyncExternalStore(
    (l) => {
      snackListeners.add(l);
      return () => snackListeners.delete(l);
    },
    () => snack,
  );
  return current ? (
    <div className="snackbar" role="status" key={current.id}>
      {current.text}
    </div>
  ) : null;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API が使えない環境向けの代替
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

export function CopyButton(props: { text: string; label?: string; variant?: 'filled' | 'tonal' | 'outlined' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    await copyText(props.text);
    showSnackbar('クリップボードにコピーしました');
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" className={`btn ${props.variant ?? 'filled'}`} onClick={copy}>
      <Icon name={done ? 'check' : 'content_copy'} />
      {props.label ?? 'コピー'}
    </button>
  );
}

/** M3 Outlined text field (ラベルは常に枠線上に表示) */
export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

export function Empty(props: { children: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      {props.icon && <Icon name={props.icon} />}
      <div>{props.children}</div>
    </div>
  );
}

/** M3 Filter chip。color を渡すとブキ種の色を左端に表示する */
export function FilterChip(props: { label: string; selected: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      className={`chip ${props.selected ? 'selected' : ''} ${props.color ? 'has-color' : ''}`}
      style={props.color ? ({ '--c': props.color } as CSSProperties) : undefined}
      onClick={props.onClick}
      aria-pressed={props.selected}
    >
      {props.selected && <Icon name="check" />}
      {props.label}
    </button>
  );
}

/** M3 Segmented button (単一選択) */
export function Segmented<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: string }[];
}) {
  return (
    <div className="segmented" role="radiogroup">
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`segment ${on ? 'selected' : ''}`}
            onClick={() => props.onChange(o.value)}
          >
            <Icon name={on ? 'check' : (o.icon ?? 'check')} className={on || o.icon ? '' : 'hidden'} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch-row">
      <span>{props.label}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

/** Xパワー到達バッジ (2500 / 2700 / 3000)。withValue で数値も並べて表示 */
export function XBadge(props: { xp: number | null; withValue?: boolean }) {
  const tier = xTier(props.xp);
  if (!tier) return props.withValue && props.xp ? <span className="xp-value">XP{props.xp}</span> : null;
  return (
    <span className="xbadge" title={`Xパワー${tier.min}以上（${props.xp}）`}>
      <img src={xBadgeUrl(tier)} alt={tier.label} />
      {props.withValue && <span className="xp-value" style={{ color: tier.dark }}>XP{props.xp}</span>}
    </span>
  );
}

/** 選手アイコン (未設定ならイニシャル) */
export function Avatar(props: { name: string; src: string; color: string; size?: number }) {
  const size = props.size ?? 40;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, borderColor: props.color, fontSize: size * 0.42 } as CSSProperties}
    >
      {props.src ? <img src={props.src} alt="" /> : [...(props.name || '?')][0]}
    </span>
  );
}
