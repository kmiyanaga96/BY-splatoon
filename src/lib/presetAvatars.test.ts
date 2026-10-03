import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_AVATARS, PRESET_AVATARS } from './presetAvatars';

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

describe('OFFICIAL_AVATARS', () => {
  it('一覧の画像がすべて public/avatars にある', () => {
    expect(OFFICIAL_AVATARS).toHaveLength(32);
    for (const p of OFFICIAL_AVATARS) {
      expect(existsSync(new URL(`../../public/avatars/${p.id}.jpg`, import.meta.url))).toBe(true);
    }
  });
});
