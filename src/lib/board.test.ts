import { describe, expect, it } from 'vitest';
import { copyTokens, hitTest, migrateBoards, moveItem, parsePlans, sheetLayout, type BoardItem, type Slide } from './board';

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

  it('文字は囲みの中で当たる', () => {
    const text: BoardItem = { type: 'text', id: 't', text: 'ここ', color: '#fff', size: 28, x: 0.5, y: 0.5 };
    // 幅 1000: 1 文字 28px、2 文字で 56px → 中心から ±28px
    expect(hitTest([text], 0.5 + 25 / 1000, 0.5, 1000, 562)?.id).toBe('t');
    expect(hitTest([text], 0.5 + 40 / 1000, 0.5, 1000, 562)).toBeNull();
  });

  it('保存データの壊れたものは捨てる', () => {
    const raw = { a: { slides: [{ id: 's1', label: '初動', memo: 'm', items: [stroke, { type: 'x' }, null, icon] }, null] }, b: 'bad', c: { slides: [] } };
    expect(parsePlans(raw)).toEqual({ a: { slides: [{ id: 's1', label: '初動', memo: 'm', items: [stroke, icon] }] } });
    expect(parsePlans(null)).toEqual({});
  });

  it('以前の保存形式 (場面ごと) を初動・抑え・打開のコマに直す', () => {
    const plans = migrateBoards({ 'ザトウ|エリア|opening': [icon], 'ザトウ|エリア|break': [stroke], 'x|y|bad': [icon] });
    expect(Object.keys(plans)).toEqual(['ザトウ|エリア']);
    expect(plans['ザトウ|エリア'].slides.map((s) => [s.label, s.items.length])).toEqual([
      ['初動', 1],
      ['抑え', 0],
      ['打開', 1],
    ]);
  });

  it('前のコマのアイコンだけを写す (今のコマのアイコンは置き換え、線は残す)', () => {
    const other: BoardItem = { ...icon, id: 'old' };
    let n = 0;
    const out = copyTokens([stroke, icon], [other, { ...stroke, id: 's2' }], () => `n${++n}`);
    expect(out.map((x) => x.id)).toEqual(['s2', 'n1']);
    expect(out[1]).toMatchObject({ type: 'icon', ref: icon.type === 'icon' ? icon.ref : '' });
  });

  it('全コマを横に並べた画像の大きさ', () => {
    const slide = (memo: string): Slide => ({ id: memo, label: 'a', memo, items: [] });
    const one = sheetLayout([slide('')], 1000, 2, true);
    expect([one.width, one.height]).toEqual([1000, 500]);
    const three = sheetLayout([slide(''), slide('メモ'), slide('')], 1000, 2, true);
    // 余白 25 × 4 + 1000 × 3、余白 25 + タイトル 70 + ラベル 60 + 盤面 500 + メモ 100 + 余白 25
    expect([three.width, three.height]).toEqual([3100, 780]);
  });
});
