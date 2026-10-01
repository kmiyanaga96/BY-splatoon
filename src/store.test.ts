import { describe, expect, it } from 'vitest';
import { xTier } from './lib/xbadge';
import { normalizeTournament, parseXp } from './store';

describe('Xパワー', () => {
  it('旧データの自由記述から XP を拾う', () => {
    expect(parseXp('XP2500 / S+10')).toBe(2500);
    expect(parseXp('ｘｐ：２７３１')).toBe(2731);
    expect(parseXp('S+10')).toBeNull();
  });

  it('xp 未保存の旧データは rank から補完し、保存済みの値はそのまま使う', () => {
    const t = normalizeTournament({
      teams: [{ players: [{ name: 'a', rank: 'XP2800' }, { name: 'b', rank: 'XP2800', xp: null }, { name: 'c', xp: 3001 }] }],
    });
    expect(t.teams[0].players.map((p) => p.xp)).toEqual([2800, null, 3001]);
  });

  it('バッジの段階', () => {
    expect(xTier(2499)).toBeNull();
    expect(xTier(2500)?.label).toBe('X2500');
    expect(xTier(2999)?.label).toBe('X2700');
    expect(xTier(3000)?.label).toBe('X3000');
    expect(xTier(null)).toBeNull();
  });
});
