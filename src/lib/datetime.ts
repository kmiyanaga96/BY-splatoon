// 大会日時の表示形式 (例: 2026/10/12(月) 21:00〜23:30) と、その読み取り。
// 保存は今まで通り表示用の文字列で持ち、入力欄で編集するときだけ年月日・時刻に分解する。

export interface Time {
  hour: number;
  minute: number;
}

export interface DateTimeParts extends Time {
  year: number;
  /** 1〜12 */
  month: number;
  day: number;
  /** 終了時刻。開始より前 (または同じ) なら翌日。未設定は null */
  end: Time | null;
}

const WEEKDAYS = '日月火水木金土';
const pad = (n: number) => String(n).padStart(2, '0');

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

const minutes = (t: Time) => t.hour * 60 + t.minute;

/** 終了時刻の表示。日をまたぐときは 0:00 を「24:00」、それ以外を「翌1:30」にする */
function formatEnd(start: Time, end: Time): string {
  if (minutes(end) > minutes(start)) return `${end.hour}:${pad(end.minute)}`;
  if (minutes(end) === 0) return '24:00';
  return `翌${end.hour}:${pad(end.minute)}`;
}

export function formatDateTime(v: DateTimeParts): string {
  const w = WEEKDAYS[new Date(v.year, v.month - 1, v.day).getDay()];
  return `${v.year}/${v.month}/${v.day}(${w}) ${v.hour}:${pad(v.minute)}〜${v.end ? formatEnd(v, v.end) : ''}`;
}

/**
 * 文字列から日時を読み取る。「2026/10/12(月) 21:00〜23:30」のほか、以前の自由記述「10/12(日) 21:00〜」(年なし) も読む。
 * 終了は「〜24:00」「〜25:30」「〜翌1:30」を読める (24 時以降は翌日の時刻にする)。
 * 年がなければ base の年 (過ぎていれば翌年)、時刻がなければ 21:00 にする。読めなければ null。
 */
export function parseDateTime(text: string, base = new Date()): DateTimeParts | null {
  const s = text.normalize('NFKC');
  const date = s.match(/(?:(\d{4})\s*[/\-年.]\s*)?(\d{1,2})\s*[/\-月.]\s*(\d{1,2})/);
  if (!date) return null;
  const month = Number(date[2]);
  const day = Number(date[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const rest = s.slice((date.index ?? 0) + date[0].length);
  const time = rest.match(/(\d{1,2})\s*[:時]\s*(\d{2})?/);
  const hour = time ? Math.min(23, Number(time[1])) : 21;
  const minute = time?.[2] ? Math.min(59, Number(time[2])) : 0;
  // 開始時刻のあとの「〜」「~」「-」に続く時刻が終了
  const after = time ? rest.slice((time.index ?? 0) + time[0].length) : '';
  const endMatch = after.match(/^[^\d]*?[〜~\-ー]\s*(?:翌\s*)?(\d{1,2})\s*[:時]\s*(\d{2})?/);
  const end = endMatch ? { hour: Number(endMatch[1]) % 24, minute: endMatch[2] ? Math.min(59, Number(endMatch[2])) : 0 } : null;
  let year = date[1] ? Number(date[1]) : base.getFullYear();
  if (!date[1] && new Date(year, month - 1, day) < new Date(base.getFullYear(), base.getMonth(), base.getDate())) year++;
  return { year, month, day: Math.min(day, daysInMonth(year, month)), hour, minute, end };
}

/** 次の土曜 21:00 (日時が未設定のときの初期値) */
export function defaultDateTime(base = new Date()): DateTimeParts {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + ((6 - base.getDay() + 7) % 7 || 7));
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: 21, minute: 0, end: null };
}

// ---- 入力欄 (<input type="date"> / <input type="time">) の値との変換 ----

export const toDateInput = (v: DateTimeParts) => `${v.year}-${pad(v.month)}-${pad(v.day)}`;
export const toTimeInput = (t: Time) => `${pad(t.hour)}:${pad(t.minute)}`;

/** "2026-10-12" → 年月日。空や不正なら null */
export function fromDateInput(s: string): Pick<DateTimeParts, 'year' | 'month' | 'day'> | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/** "21:30" → 時刻。空や不正なら null */
export function fromTimeInput(s: string): Time | null {
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}
