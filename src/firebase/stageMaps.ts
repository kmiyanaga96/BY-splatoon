// 作戦ボードのステージ画像。Firestore の stageMaps/{ルール:ステージ} に、縮小した画像を data URL で持つ。
//   閲覧は誰でも、登録・削除は編集者だけ (firestore.rules)。
// 画像を Firestore に入れるのは、Canvas に描いて PNG に書き出すとき別オリジンの画像だと書き出せないため (CORS の設定が要らない)。
// 1 枚 1MB 未満 (Firestore のドキュメント上限) に収まるよう、読み込み時に JPEG に縮小する。

import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './app';
import { currentEmail } from './auth';

/** firestore.rules と同じ上限 (data URL の文字数) */
export const MAX_MAP_CHARS = 1_000_000;

const mapId = (stage: string, rule: string) => `${rule}:${stage}`;

/** 登録されている画像 (data URL)。なければ null */
export async function loadStageMap(stage: string, rule: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'stageMaps', mapId(stage, rule)));
  const image: unknown = snap.data()?.image;
  return typeof image === 'string' && image.startsWith('data:image/') ? image : null;
}

export async function saveStageMap(stage: string, rule: string, image: string): Promise<void> {
  const email = currentEmail();
  if (!email) throw new Error('ログインしていないため登録できません');
  await setDoc(doc(db, 'stageMaps', mapId(stage, rule)), { stage, rule, image, updatedAt: serverTimestamp(), updatedBy: email });
}

export async function deleteStageMap(stage: string, rule: string): Promise<void> {
  await deleteDoc(doc(db, 'stageMaps', mapId(stage, rule)));
}
