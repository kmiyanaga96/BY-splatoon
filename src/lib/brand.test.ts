import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeTournament } from '../model';
import { BRAND_ICON, BRAND_OPTIONS } from './brand';

describe('大会のロゴ', () => {
  it('ロゴの画像がすべて public/brand にある', () => {
    for (const url of [...BRAND_OPTIONS.map((b) => b.image), BRAND_ICON]) {
      const file = url.slice(url.indexOf('brand/'));
      expect(existsSync(new URL(`../../public/${file}`, import.meta.url))).toBe(true);
    }
  });

  it('ロゴの設定がない以前の大会・不正な値は BYリーグ になる', () => {
    expect(normalizeTournament({ id: 'a', rules: {} }).rules.brand).toBe('league');
    expect(normalizeTournament({ id: 'a', rules: { brand: 'xxx' } }).rules.brand).toBe('league');
    expect(normalizeTournament({ id: 'a', rules: { brand: 'inkparty-pink' } }).rules.brand).toBe('inkparty-pink');
  });
});
