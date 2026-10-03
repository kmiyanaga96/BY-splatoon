import { describe, expect, it } from 'vitest';
import { defaultDateTime, formatDateTime, parseDateTime } from './datetime';

const base = new Date(2026, 9, 3); // 2026/10/3 (土)

describe('大会日時', () => {
  it('曜日つきで表示する', () => {
    expect(formatDateTime({ year: 2026, month: 10, day: 12, hour: 21, minute: 0 })).toBe('2026/10/12(月) 21:00〜');
  });

  it('表示した文字列を読み戻せる', () => {
    expect(parseDateTime('2026/10/12(月) 21:05〜', base)).toEqual({ year: 2026, month: 10, day: 12, hour: 21, minute: 5 });
  });

  it('以前の自由記述 (年なし・全角) も読める。過ぎた日付は翌年', () => {
    expect(parseDateTime('１０/１２(日) ２１:００〜', base)).toEqual({ year: 2026, month: 10, day: 12, hour: 21, minute: 0 });
    expect(parseDateTime('4/1 20時', base)).toEqual({ year: 2027, month: 4, day: 1, hour: 20, minute: 0 });
  });

  it('時刻がなければ 21:00、読めなければ null', () => {
    expect(parseDateTime('10月20日', base)).toMatchObject({ month: 10, day: 20, hour: 21, minute: 0 });
    expect(parseDateTime('未定', base)).toBeNull();
  });

  it('未設定の初期値は次の土曜 21:00', () => {
    expect(defaultDateTime(base)).toEqual({ year: 2026, month: 10, day: 10, hour: 21, minute: 0 });
    expect(defaultDateTime(new Date(2026, 9, 5))).toMatchObject({ day: 10 });
  });
});
