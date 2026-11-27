// ブキアイコン (公式画像) を取得して public/weapons/<ブキID>.png に、サブ・スペシャルのアイコンを public/subspe/<ID>.png に保存する。
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
const subspe = JSON.parse(await readFile(root('src/data/subspe.json'), 'utf8'));
await mkdir(root('public/weapons'), { recursive: true });
await mkdir(root('public/subspe'), { recursive: true });

const base = 'https://raw.githubusercontent.com/Leanny/splat3/main/images';
// ブキ → public/weapons/<ID>.png、サブ・スペシャル → public/subspe/<ID>.png (作戦ボードのアイコン)
const jobs = [
  ...weapons.map((w) => ({ name: w.name, file: root(`public/weapons/${w.id}.png`), url: `${base}/weapon_flat/Path_Wst_${w.id}.png` })),
  ...subspe.map((x) => ({
    name: x.name,
    file: root(`public/subspe/${x.id}.png`),
    url: `${base}/subspe/${x.kind === 'sub' ? 'Wsb' : 'Wsp'}_${x.id}00.png`,
  })),
];

const exists = (p) => access(p).then(() => true, () => false);
const failed = [];
let saved = 0;

// 同時に 8 件ずつ取得
const queue = [...jobs];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let w = queue.shift(); w; w = queue.shift()) {
      if (!force && (await exists(w.file))) continue;
      const res = await fetch(w.url);
      if (!res.ok) {
        failed.push(`${w.name}: ${res.status}`);
        continue;
      }
      await writeFile(w.file, Buffer.from(await res.arrayBuffer()));
      saved++;
    }
  }),
);

console.log(`${saved} icons saved to public/weapons/ and public/subspe/`);
if (failed.length) {
  console.log(`取得できなかったブキ (${failed.length}):\n  ${failed.join('\n  ')}`);
  process.exitCode = 1;
}
