// 大会のロゴ (ブランド)。競技寄りの「BYリーグ」と、エンジョイ向けの「BYリーグ InkParty」(配色 2 種)。
// 画像は public/brand/ の PNG (512px・透過)。元の SVG は docs/brand/ にある。

import type { Brand, Tournament } from '../types';

export interface BrandInfo {
  label: string;
  /** 512px の透過 PNG */
  image: string;
}

const url = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`;

export const BRANDS: Record<Brand, BrandInfo> = {
  league: { label: 'BYリーグ（競技）', image: url('by-league.png') },
  'inkparty-yellow': { label: 'InkParty（イエロー×ブルー）', image: url('by-league-inkparty-yellow.png') },
  'inkparty-pink': { label: 'InkParty（ピンク×シアン）', image: url('by-league-inkparty-pink.png') },
};

export const BRAND_OPTIONS = (Object.keys(BRANDS) as Brand[]).map((value) => ({ value, ...BRANDS[value] }));

/** 六角形にマークだけのアイコン (ファビコン・アプリのヘッダー) */
export const BRAND_ICON = url('by-icon-180.png');

export function brandOf(t: Tournament): BrandInfo {
  return BRANDS[t.rules.brand];
}
