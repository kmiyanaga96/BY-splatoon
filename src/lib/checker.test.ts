import { describe, expect, it, vi } from 'vitest';

// 判定を確かめやすいよう、戦術データは仮の値にする
vi.mock('../data/tactics.json', () => ({
  default: {
    mains: {
      Shooter_Normal: { role: '前衛', range: 2.4, paintArea: 3, paintBurst: 3, kill: 3, objArea: 3, objTower: 3, objRainmaker: 3, objClam: 3 },
      Shooter_Flash: { role: '中衛', range: 3.4, paintArea: 2, paintBurst: 4, kill: 4, objArea: 2, objTower: 3, objRainmaker: 3, objClam: 3 },
      Charger_Long: { role: '後衛', range: 6.2, paintArea: 2, paintBurst: 5, kill: 5, objArea: 2, objTower: 3, objRainmaker: 3, objClam: 3 },
      Saber_Normal: { role: '中衛', range: 4.5, paintArea: 4, paintBurst: 4, kill: 5, objArea: 3, objTower: 4, objRainmaker: 5, objClam: 4 },
      Shooter_Short: { role: '前衛', range: 1.2, paintArea: 3, paintBurst: 2, kill: 3, objArea: 3, objTower: 2, objRainmaker: 4, objClam: 3 },
      Brush_Mini: { role: '前衛', range: 1.2, paintArea: 2, paintBurst: 2, kill: 4, objArea: 3, objTower: 1, objRainmaker: 3, objClam: 5 },
    },
    kits: {
      Shooter_Normal_00: { entry: 4, short: 'スシ' },
      Shooter_Flash_00: { entry: 4, short: 'ボトル' },
      Charger_Long_00: { entry: 4, short: 'リッター' },
      Saber_Normal_00: { entry: 4, short: 'ジム' },
      Shooter_Short_00: { entry: 2, short: 'ボールド' },
      Shooter_Short_01: { entry: 1, short: 'ボルネオ' },
      Brush_Mini_00: { entry: 2, short: 'パブロ' },
      Brush_Mini_01: { entry: 2, short: 'パブロヒュー' },
    },
    specials: { SpUltraShot: ['打開・起点'], SpBlower: ['抑え・遅延'], SpShockSonar: ['抑え・遅延'], SpSuperHook: ['抑え・遅延'] },
    kitSpecial: {
      Shooter_Normal_00: 'SpUltraShot',
      Shooter_Flash_00: 'SpUltraShot',
      Charger_Long_00: 'SpShockSonar',
      Saber_Normal_00: 'SpSuperHook',
      Shooter_Short_00: 'SpBlower',
      Shooter_Short_01: 'SpBlower',
      Brush_Mini_00: 'SpBlower',
      Brush_Mini_01: 'SpBlower',
    },
  },
}));

const { checkComp, checkText, compName } = await import('./checker');

const COMP = ['Shooter_Normal_00', 'Shooter_Flash_00', 'Charger_Long_00', 'Saber_Normal_00'];

describe('編成チェッカー', () => {
  it('4 人の平均と射程を出す', () => {
    const r = checkComp(COMP, 'ホコ');
    expect(r.gauges.map((g) => [g.label, g.value])).toEqual([
      ['塗り拡張', 2.75],
      ['瞬間塗り', 4],
      ['キル', 4.25],
      ['打開', 4],
      ['ホコ関与', 3.5],
    ]);
    expect(r.maxRange).toBe(6.2);
    expect(r.avgRange).toBeCloseTo(4.125);
  });

  it('ルールのオブジェクト担当を、関与の高い順 (同点は枠の順) に出す', () => {
    const r = checkComp(COMP, 'ホコ');
    expect(r.objectRank).toEqual([3, 0, 1, 2]);
    expect(r.advice.at(-1)).toEqual({ kind: 'role', text: 'ホコ持ち: 第 1 候補 ジム、第 2 候補 スシ' });
  });

  it('強みを出す (長射程の軸・キル力・打開力)', () => {
    const texts = checkComp(COMP, 'ホコ').advice.map((a) => a.text);
    expect(texts.some((t) => t.startsWith('長射程の リッター'))).toBe(true);
    expect(texts.some((t) => t.startsWith('キル力が高い'))).toBe(true);
    expect(texts.some((t) => t.startsWith('打開力が高い'))).toBe(true);
  });

  it('短射程・打開力不足・塗り不足を警告する (エリアは塗りの基準が厳しい)', () => {
    const comp = ['Shooter_Short_00', 'Shooter_Short_01', 'Brush_Mini_00', 'Brush_Mini_01'];
    const r = checkComp(comp, 'エリア');
    const warns = r.advice.filter((a) => a.kind === 'warn').map((a) => a.text.split(':')[0]);
    expect(warns).toEqual(['最長射程 1.2 ライン', '塗り拡張が少ない', '瞬間塗りが弱い', '打開力不足']);
    // 警告・強みは 4 行まで + 役割分担 1 行
    expect(r.advice.length).toBeLessThanOrEqual(5);
  });

  it('4 人そろうまでは傾向の判定をしない', () => {
    const r = checkComp(['Shooter_Normal_00', null, 'Charger_Long_00', null], 'ヤグラ');
    expect(r.count).toBe(2);
    expect(r.advice.map((a) => a.kind)).toEqual(['role']);
  });

  it('編成名と Discord 用のテキスト', () => {
    expect(compName(COMP, 'ホコ')).toBe('ホコ｜スシ・ボトル・リッター・ジム');
    const text = checkText(COMP, ['A', null, null, null], 'ホコ', checkComp(COMP, 'ホコ'));
    const lines = text.split('\n');
    expect(lines[0]).toBe('**編成チェック｜スシ・ボトル・リッター・ジム**（ホコ）');
    expect(lines[1]).toBe('A: スプラシューター / ボトルガイザー / リッター4K / ジムワイパー');
    expect(lines[2]).toBe('塗り拡張 2.8 / 瞬間塗り 4.0 / キル 4.3 / 打開 4.0 / ホコ関与 3.5 / 最長射程 6.2');
    expect(lines.at(-1)).toBe('🎯 ホコ持ち: 第 1 候補 ジム、第 2 候補 スシ');
  });
});
