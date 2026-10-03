import { describe, expect, it } from 'vitest';
import { PRESET_AVATARS } from './presetAvatars';

describe('PRESET_AVATARS', () => {
  it('id と画像が重複しない', () => {
    expect(new Set(PRESET_AVATARS.map((p) => p.id)).size).toBe(PRESET_AVATARS.length);
    expect(new Set(PRESET_AVATARS.map((p) => p.url)).size).toBe(PRESET_AVATARS.length);
  });

  it('Firestore ルールの avatar の条件 (data:image/ で始まる 300KB 以内の文字列) を満たす', () => {
    for (const p of PRESET_AVATARS) {
      expect(p.url).toMatch(/^data:image\/svg\+xml/);
      expect(p.url.length).toBeLessThan(300000);
      expect(decodeURIComponent(p.url.split(',')[1])).not.toContain('NaN');
    }
  });
});
