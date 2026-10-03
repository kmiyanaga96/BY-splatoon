// 大会日時の表示形式 (例: 2026/10/12(日) 21:00〜) と、その読み取り。
// 保存は今まで通り表示用の文字列で持ち、ホイールで選ぶときだけ年月日・時刻に分解する。

export interface DateTimeParts {
  year: number;
  /** 1〜12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const WEEKDAYS = '日月火水木金土';

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function formatDateTime(v: DateTimeParts): string {
  const w = WEEKDAYS[new Date(v.year, v.month - 1, v.day).getDay()];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${v.year}/${v.month}/${v.day}(${w}) ${v.hour}:${pad(v.minute)}〜`;
}

/**
 * 文字列から日時を読み取る。「2026/10/12(日) 21:00〜」のほか、以前の自由記述「10/12(日) 21:00〜」(年なし) も読む。
 * 年がなければ base の年 (過ぎていれば翌年)、時刻がなければ 21:00 にする。読めなければ null。
 */
export function parseDateTime(text: string, base = new Date()): DateTimeParts | null {
  const s = text.normalize('NFKC');
  const date = s.match(/(?:(\d{4})\s*[/\-年.]\s*)?(\d{1,2})\s*[/\-月.]\s*(\d{1,2})/);
  if (!date) return null;
  const month = Number(date[2]);
  const day = Number(date[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const time = s.slice((date.index ?? 0) + date[0].length).match(/(\d{1,2})\s*[:時]\s*(\d{2})?/);
  const hour = time ? Math.min(23, Number(time[1])) : 21;
  const minute = time?.[2] ? Math.min(59, Number(time[2])) : 0;
  let year = date[1] ? Number(date[1]) : base.getFullYear();
  if (!date[1] && new Date(year, month - 1, day) < new Date(base.getFullYear(), base.getMonth(), base.getDate())) year++;
  return { year, month, day: Math.min(day, daysInMonth(year, month)), hour, minute };
}

/** 次の土曜 21:00 (日時が未設定のときの初期値) */
export function defaultDateTime(base = new Date()): DateTimeParts {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + ((6 - base.getDay() + 7) % 7 || 7));
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: 21, minute: 0 };
}
