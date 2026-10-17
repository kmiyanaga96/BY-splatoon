import { defaultDateTime, formatDateTime, fromDateInput, fromTimeInput, parseDateTime, toDateInput, toTimeInput, type DateTimeParts } from '../lib/datetime';
import { IconButton } from './ui';

/**
 * 大会日時の入力欄: 日付 (カレンダー)・開始時刻・終了時刻 (任意)。
 * ブラウザ標準の入力欄なので、PC では数字の直接入力や ↑↓ キーで 1 つずつ、スマホでは OS のピッカーで選べる。
 * 保存は表示用の文字列 (例: 2026/10/17(土) 21:00〜23:30)。
 */
export function DateTimeField(props: { value: string; onChange: (v: string) => void }) {
  const parsed = props.value ? parseDateTime(props.value) : null;
  // 読めない以前の自由記述は、入力欄は空にして元の文字列を下に表示する (どれかを入れると置き換わる)
  const unreadable = !!props.value && !parsed;
  const emit = (patch: Partial<DateTimeParts>) => props.onChange(formatDateTime({ ...(parsed ?? defaultDateTime()), ...patch }));

  return (
    <div className="datetime-inputs">
      <input
        className="input datetime-date"
        type="date"
        aria-label="日付"
        value={parsed ? toDateInput(parsed) : ''}
        onChange={(e) => {
          const date = fromDateInput(e.target.value);
          // 日付を消したら日時ごと消す
          if (!date) props.onChange('');
          else emit(date);
        }}
      />
      <span className="datetime-times">
        <input
          className="input datetime-time"
          type="time"
          step={300}
          aria-label="開始時刻"
          value={parsed ? toTimeInput(parsed) : ''}
          onChange={(e) => {
            const time = fromTimeInput(e.target.value);
            if (time) emit(time);
          }}
        />
        <span aria-hidden="true">〜</span>
        <input
          className="input datetime-time"
          type="time"
          step={300}
          aria-label="終了時刻（任意）"
          value={parsed?.end ? toTimeInput(parsed.end) : ''}
          onChange={(e) => emit({ end: fromTimeInput(e.target.value) })}
        />
        {parsed?.end && <IconButton icon="close" label="終了時刻を消す" onClick={() => emit({ end: null })} />}
      </span>
      {unreadable && <span className="field-hint">いまの値: {props.value}（日付を選ぶと置き換わります）</span>}
    </div>
  );
}
