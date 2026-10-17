import { describe, expect, it } from 'vitest';
import { defaultDateTime, formatDateTime, fromDateInput, fromTimeInput, parseDateTime, toDateInput, toTimeInput } from './datetime';

const base = new Date(2026, 9, 3); // 2026/10/3 (土)
const at = (hour: number, minute = 0) => ({ hour, minute });

describe('大会日時', () => {
  it('曜日つきで表示する。終了がなければ「〜」で終わる', () => {
    expect(formatDateTime({ year: 2026, month: 10, day: 12, ...at(21), end: null })).toBe('2026/10/12(月) 21:00〜');
  });

  it('終了時刻を表示する。日をまたぐと 0:00 は 24:00、それ以外は「翌」', () => {
    const d = { year: 2026, month: 10, day: 17, ...at(21) };
    expect(formatDateTime({ ...d, end: at(23, 30) })).toBe('2026/10/17(土) 21:00〜23:30');
    expect(formatDateTime({ ...d, end: at(0) })).toBe('2026/10/17(土) 21:00〜24:00');
    expect(formatDateTime({ ...d, end: at(1, 30) })).toBe('2026/10/17(土) 21:00〜翌1:30');
  });

  it('表示した文字列を読み戻せる (終了つきも)', () => {
    expect(parseDateTime('2026/10/12(月) 21:05〜', base)).toEqual({ year: 2026, month: 10, day: 12, ...at(21, 5), end: null });
    for (const end of [at(23, 30), at(0), at(1, 30)]) {
      const v = { year: 2026, month: 10, day: 17, ...at(21), end };
      expect(parseDateTime(formatDateTime(v), base)).toEqual(v);
    }
  });

  it('以前の自由記述 (年なし・全角・「〜24:00」「~25:30」) も読める。過ぎた日付は翌年', () => {
    expect(parseDateTime('１０/１２(日) ２１:００〜', base)).toEqual({ year: 2026, month: 10, day: 12, ...at(21), end: null });
    expect(parseDateTime('4/1 20時', base)).toEqual({ year: 2027, month: 4, day: 1, ...at(20), end: null });
    expect(parseDateTime('10/17 21:00〜24:00', base)?.end).toEqual(at(0));
    expect(parseDateTime('10/17 21:00~25:30', base)?.end).toEqual(at(1, 30));
  });

  it('時刻がなければ 21:00、読めなければ null', () => {
    expect(parseDateTime('10月20日', base)).toMatchObject({ month: 10, day: 20, ...at(21), end: null });
    expect(parseDateTime('未定', base)).toBeNull();
  });

  it('未設定の初期値は次の土曜 21:00', () => {
    expect(defaultDateTime(base)).toEqual({ year: 2026, month: 10, day: 10, ...at(21), end: null });
    expect(defaultDateTime(new Date(2026, 9, 5))).toMatchObject({ day: 10 });
  });

  it('入力欄の値と相互に変換できる', () => {
    const v = { year: 2026, month: 1, day: 5, ...at(9, 5), end: null };
    expect(toDateInput(v)).toBe('2026-01-05');
    expect(fromDateInput('2026-01-05')).toEqual({ year: 2026, month: 1, day: 5 });
    expect(toTimeInput(v)).toBe('09:05');
    expect(fromTimeInput('09:05')).toEqual(at(9, 5));
    expect(fromDateInput('')).toBeNull();
    expect(fromTimeInput('')).toBeNull();
  });
});
