import { describe, expect, it } from 'vitest';
import { convertPool, newTournament, normalizeData } from './model';

// 選手 DB 導入前 (v1) の保存データ
const v1 = {
  version: 1,
  currentId: 'x2',
  tournaments: [
    {
      id: 'x1',
      name: '第1回',
      teams: [
        {
          id: 'a',
          name: 'A',
          players: [
            { id: 'p1', name: 'イカ太郎', rank: 'XP2600', avatar: 'data:image/jpeg;base64,AAA', leader: true },
            { id: 'p2', name: 'タコ', featured: true, comment: 'エース' },
          ],
        },
      ],
    },
    {
      id: 'x2',
      name: '第2回',
      teams: [{ id: 'b', name: 'B', players: [{ id: 'p9', name: ' イカ太郎 ', xp: 2750, mains: ['Shooter_Normal_00'] }] }],
    },
  ],
};

describe('v1 → v2 の移行', () => {
  const d = normalizeData(v1);

  it('チーム内の選手を選手 DB に移し、同じ名前は 1 人にまとめる', () => {
    expect(d.version).toBe(2);
    expect(d.players.map((p) => p.name)).toEqual(['イカ太郎', 'タコ']);
    const ika = d.players[0];
    expect(ika.id).toBe('p1');
    expect(ika.avatar).toMatch(/^data:image/);
    expect(ika.xp).toBe(2600); // 先に出てきた値を優先し、空欄だけ埋める
    expect(ika.mains).toEqual(['Shooter_Normal_00']);
    expect(ika.note).toBe('XP2600');
  });

  it('大会ごとの情報 (リーダー・注目・コメント) は所属側に残る', () => {
    expect(d.tournaments[0].teams[0].members).toEqual([
      { playerId: 'p1', leader: true, featured: false, comment: '' },
      { playerId: 'p2', leader: false, featured: true, comment: 'エース' },
    ]);
    expect(d.tournaments[1].teams[0].members[0].playerId).toBe('p1');
  });

  it('v2 として読み直しても変わらない', () => {
    expect(normalizeData(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('旧形式の JSON を取り込むとき、既存の選手 DB に名前で合流する', () => {
    const merged = normalizeData({ tournaments: [{ id: 'x3', teams: [{ id: 'c', players: [{ id: 'zz', name: 'タコ' }] }] }] }, d.players);
    expect(merged.tournaments[0].teams[0].members[0].playerId).toBe('p2');
  });

  it('存在しない選手への所属は外す', () => {
    const broken = normalizeData({ version: 2, players: [], tournaments: [{ id: 't', teams: [{ id: 'a', members: [{ playerId: 'ghost' }] }] }] });
    expect(broken.tournaments[0].teams[0].members).toEqual([]);
  });
});

describe('候補の単位', () => {
  it('単位の設定がない旧データはブキ単位として読み込む', () => {
    const d = normalizeData({ tournaments: [{ id: 'x', teams: [{ id: 'a', pool: ['Shooter_Short_00'] }], rules: { poolMax: 3 } }] });
    expect(d.tournaments[0].rules.poolUnit).toBe('weapon');
    expect(d.tournaments[0].teams[0].pool).toEqual(['Shooter_Short_00']);
  });

  it('新しい大会はメイン単位・2 種まで', () => {
    expect(newTournament().rules).toMatchObject({ poolUnit: 'main', poolMax: 2 });
  });

  it('ブキ→メインはマイナーチェンジをまとめ、メイン→ブキは代表ブキにする', () => {
    expect(convertPool(['Shooter_Short_00', 'Shooter_Short_01', 'Charger_Normal_O'], 'main')).toEqual(['Shooter_Short', 'Charger_Normal']);
    expect(convertPool(['Shooter_Short', 'Charger_Normal'], 'weapon')).toEqual(['Shooter_Short_00', 'Charger_Normal_00']);
  });

  it('メイン単位のデータに残ったブキ ID はメインにそろえる', () => {
    const d = normalizeData({
      tournaments: [{ id: 'x', teams: [{ id: 'a', pool: ['Shooter_Short_01', 'Shooter_Short'] }], rules: { poolUnit: 'main' } }],
    });
    expect(d.tournaments[0].teams[0].pool).toEqual(['Shooter_Short']);
  });
});
