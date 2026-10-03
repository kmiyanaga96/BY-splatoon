import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESET_AVATARS } from './presetAvatars';

describe('PRESET_AVATARS', () => {
  it('一覧の画像がすべて public/avatars にある', () => {
    expect(PRESET_AVATARS).toHaveLength(32);
    for (const p of PRESET_AVATARS) {
      expect(existsSync(new URL(`../../public/avatars/${p.id}.jpg`, import.meta.url))).toBe(true);
    }
  });
});
