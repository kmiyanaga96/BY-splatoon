import { describe, expect, it } from 'vitest';
import { hitTest, moveItem, parseBoards, type BoardItem } from './board';

const stroke: BoardItem = { type: 'stroke', id: 's', color: '#fff', width: 6, arrow: true, points: [[0.1, 0.1], [0.5, 0.1]] };
const icon: BoardItem = { type: 'icon', id: 'i', kind: 'weapon', ref: 'Shooter_Short_00', color: '#fff', x: 0.3, y: 0.1 };

describe('作戦ボード', () => {
  it('上に描いたものから当たりを調べる (アイコンが線の上なら アイコン)', () => {
    expect(hitTest([stroke, icon], 0.3, 0.1, 1000, 562)?.id).toBe('i');
    expect(hitTest([icon, stroke], 0.3, 0.1, 1000, 562)?.id).toBe('s');
    expect(hitTest([stroke], 0.45, 0.1, 1000, 562)?.id).toBe('s');
    expect(hitTest([stroke, icon], 0.8, 0.8, 1000, 562)).toBeNull();
  });

  it('線は太さ + 余裕の範囲で当たる', () => {
    // 線から 0.012 (=12px) 離れた点: 太さ 6 の半分 3 + 余裕 8 = 11px より遠いので外れ
    expect(hitTest([stroke], 0.3, 0.1 + 12 / 562, 1000, 562)).toBeNull();
    expect(hitTest([stroke], 0.3, 0.1 + 9 / 562, 1000, 562)?.id).toBe('s');
  });

  it('縦長のボードでは長い辺 (高さ) を基準にアイコンの大きさを決める', () => {
    // 幅 400・高さ 1000: 半径は 0.026 × 1000 = 26px (幅基準なら 10.4px)
    expect(hitTest([icon], 0.3 + 25 / 400, 0.1, 400, 1000)?.id).toBe('i');
    expect(hitTest([icon], 0.3 + 40 / 400, 0.1, 400, 1000)).toBeNull();
  });

  it('動かす。アイコンはボードの外に出ない', () => {
    expect(moveItem(icon, 0.1, 0.2)).toMatchObject({ x: 0.4, y: 0.30000000000000004 });
    expect(moveItem(icon, 2, -2)).toMatchObject({ x: 1, y: 0 });
    const moved = moveItem(stroke, 0.1, 0) as typeof stroke & { points: [number, number][] };
    expect(moved.points[0][0]).toBeCloseTo(0.2);
  });

  it('保存データの壊れたものは捨てる', () => {
    expect(parseBoards({ a: [stroke, { type: 'x' }, null, icon], b: 'bad' })).toEqual({ a: [stroke, icon] });
    expect(parseBoards(null)).toEqual({});
  });
});
