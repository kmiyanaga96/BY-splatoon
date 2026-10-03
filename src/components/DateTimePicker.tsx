import { useEffect, useRef, useState } from 'react';
import { daysInMonth, defaultDateTime, formatDateTime, parseDateTime, type DateTimeParts } from '../lib/datetime';
import { Icon, Modal } from './ui';

const ITEM = 40; // 1 行の高さ (px)。CSS の .wheel-item と合わせる

/**
 * アラームアプリのようにスクロールで選ぶ 1 列。スクロールが止まった位置の値を選ぶ (CSS の scroll-snap で行にそろう)。
 * 行をクリックしてもその値に移動する。
 */
function Wheel(props: { label: string; values: number[]; value: number; format?: (n: number) => string; onChange: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const index = Math.max(0, props.values.indexOf(props.value));

  // 外から値が変わったとき (初期表示・日数の変化) に位置を合わせる
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ITEM) !== index) el.scrollTop = index * ITEM;
  }, [index]);

  const onScroll = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(props.values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
      if (props.values[i] !== props.value) props.onChange(props.values[i]);
    }, 120);
  };

  const fmt = props.format ?? String;
  return (
    <div className="wheel">
      <span className="wheel-label">{props.label}</span>
      <div
        ref={ref}
        className="wheel-list"
        onScroll={onScroll}
        role="listbox"
        aria-label={props.label}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const next = props.values[Math.min(props.values.length - 1, Math.max(0, index + d))];
          props.onChange(next);
        }}
      >
        {props.values.map((n, i) => (
          <div
            key={n}
            role="option"
            aria-selected={i === index}
            className={`wheel-item ${i === index ? 'selected' : ''}`}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}
          >
            {fmt(n)}
          </div>
        ))}
      </div>
    </div>
  );
}

const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** 大会日時の入力欄。押すとホイールで年・月・日・時・分を選ぶダイアログを開く */
export function DateTimeField(props: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateTimeParts>(defaultDateTime);
  const start = () => {
    const parsed = parseDateTime(props.value);
    // 5 分刻みのホイールに合わせる
    setDraft(parsed ? { ...parsed, minute: Math.round(parsed.minute / 5) * 5 % 60 } : defaultDateTime());
    setOpen(true);
  };
  const set = (patch: Partial<DateTimeParts>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      return { ...next, day: Math.min(next.day, daysInMonth(next.year, next.month)) };
    });
  const thisYear = new Date().getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <>
      <button type="button" className="input datetime-field" onClick={start}>
        <Icon name="calendar_month" />
        <span className={props.value ? '' : 'muted'}>{props.value || '日時を選ぶ'}</span>
      </button>
      {open && (
        <Modal
          title="大会の日時"
          onClose={() => setOpen(false)}
          actions={
            <>
              {props.value && (
                <button
                  className="btn text"
                  onClick={() => {
                    props.onChange('');
                    setOpen(false);
                  }}
                >
                  日時を消す
                </button>
              )}
              <span className="spacer" />
              <button className="btn text" onClick={() => setOpen(false)}>
                キャンセル
              </button>
              <button
                className="btn filled"
                onClick={() => {
                  props.onChange(formatDateTime(draft));
                  setOpen(false);
                }}
              >
                決定
              </button>
            </>
          }
        >
          <p className="datetime-preview">{formatDateTime(draft)}</p>
          <div className="wheels">
            <Wheel label="年" values={range(Math.min(thisYear, draft.year), thisYear + 2)} value={draft.year} onChange={(year) => set({ year })} />
            <Wheel label="月" values={range(1, 12)} value={draft.month} onChange={(month) => set({ month })} />
            <Wheel label="日" values={range(1, daysInMonth(draft.year, draft.month))} value={draft.day} onChange={(day) => set({ day })} />
            <span className="wheel-gap" />
            <Wheel label="時" values={range(0, 23)} value={draft.hour} format={pad} onChange={(hour) => set({ hour })} />
            <Wheel label="分" values={range(0, 55, 5)} value={draft.minute} format={pad} onChange={(minute) => set({ minute })} />
          </div>
        </Modal>
      )}
    </>
  );
}
