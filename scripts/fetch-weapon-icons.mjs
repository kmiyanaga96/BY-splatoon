// ブキアイコン (公式画像) を取得して public/weapons/<ブキID>.png に保存する。
// データ元: https://github.com/Leanny/splat3 の images/weapon_flat/ (256x256 PNG)
//
// 使い方: npm run update-weapon-icons          (無いものだけ取得)
//         npm run update-weapon-icons -- --force (全部取り直す)
// 先に npm run update-weapons で src/data/weapons.json を最新にしておくこと。

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const force = process.argv.includes('--force');
const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { weapons } = JSON.parse(await readFile(root('src/data/weapons.json'), 'utf8'));
const outDir = root('public/weapons');
await mkdir(outDir, { recursive: true });

const exists = (p) => access(p).then(() => true, () => false);
const failed = [];
let saved = 0;

// 同時に 8 件ずつ取得
const queue = [...weapons];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let w = queue.shift(); w; w = queue.shift()) {
      const file = `${outDir}/${w.id}.png`;
      if (!force && (await exists(file))) continue;
      const url = `https://raw.githubusercontent.com/Leanny/splat3/main/images/weapon_flat/Path_Wst_${w.id}.png`;
      const res = await fetch(url);
      if (!res.ok) {
        failed.push(`${w.id} (${w.name}): ${res.status}`);
        continue;
      }
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      saved++;
    }
  }),
);

console.log(`${saved} icons saved to public/weapons/`);
if (failed.length) {
  console.log(`取得できなかったブキ (${failed.length}):\n  ${failed.join('\n  ')}`);
  process.exitCode = 1;
}
