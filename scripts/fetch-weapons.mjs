// スプラトゥーン3のバトル用ブキ一覧とステージ名を取得して
// src/data/weapons.json と src/data/stages.json を生成する。
// データ元: https://github.com/Leanny/splat3 (ゲームデータの解析結果)
//
// 使い方: npm run update-weapons -- [バージョン番号]
//   例) npm run update-weapons -- 1120   (= Ver.11.2.0)
// 新しいアップデートが来たら、上記リポジトリの data/mush/ にある最新の番号を指定する。

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const version = process.argv[2] ?? '1120';
const base = 'https://raw.githubusercontent.com/Leanny/splat3/main/data';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const [mains, lang] = await Promise.all([
  getJson(`${base}/mush/${version}/WeaponInfoMain.json`),
  getJson(`${base}/language/JPja_full.json`),
]);

const mainNames = lang['CommonMsg/Weapon/WeaponName_Main'];
const subNames = lang['CommonMsg/Weapon/WeaponName_Sub'];
const spNames = lang['CommonMsg/Weapon/WeaponName_Special'];
// "Work/Gyml/Bomb_Splash.spl__WeaponInfoSub.gyml" -> "Bomb_Splash"
const gymlKey = (path) => path?.match(/Gyml\/(\w+)\.spl__/)?.[1] ?? '';

const weapons = mains
  .filter((w) => w.Type === 'Versus')
  .sort((a, b) => a.Id - b.Id)
  .map((w) => {
    const id = w.__RowId; // 例: Shooter_Normal_00
    const [category, kind] = id.split('_');
    return {
      id,
      name: mainNames[id],
      category, // Shooter / Blaster / Roller / ...
      main: `${category}_${kind}`, // 同じメインを持つブキのグループ
      sub: subNames[gymlKey(w.SubWeapon)] ?? '',
      special: spNames[gymlKey(w.SpecialWeapon)] ?? '',
      sp: w.SpecialPoint,
      // ヒーロー/オクタ/オーダー系のレプリカ(性能はオリジナルと同じ)
      replica: /_(H|Oct|O)$/.test(id),
    };
  });

const missing = weapons.filter((w) => !w.name);
if (missing.length) throw new Error(`名前が見つからないブキ: ${missing.map((w) => w.id).join(', ')}`);

// ランダム・未知・フェス専用ステージは除外
const excludeStages = new Set(['Random', 'Unknown', 'Manbou']);
const stages = Object.entries(lang['CommonMsg/VS/VSStageName'])
  .filter(([key]) => !excludeStages.has(key))
  .map(([, name]) => name);

const out = (file) => fileURLToPath(new URL(`../src/data/${file}`, import.meta.url));
await writeFile(out('weapons.json'), JSON.stringify({ version, weapons }, null, 1) + '\n');
await writeFile(out('stages.json'), JSON.stringify(stages, null, 1) + '\n');
console.log(`${weapons.length} weapons, ${stages.length} stages (data version ${version})`);
