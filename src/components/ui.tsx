import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { categoryOf, getWeapon, weaponName } from '../data/weapons';

export function Modal(props: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal ${props.wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="btn ghost" onClick={props.onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
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
          ×
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

export function CopyButton(props: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
    } catch {
      // clipboard API が使えない環境向けの代替
      const ta = document.createElement('textarea');
      ta.value = props.text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button className="btn primary" onClick={copy}>
      {done ? 'コピーしました' : (props.label ?? 'コピー')}
    </button>
  );
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

export function Empty(props: { children: ReactNode }) {
  return <div className="empty">{props.children}</div>;
}
