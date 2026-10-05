// Cloud Storage のセキュリティルールのテスト (優勝賞品の動画)。エミュレーター上で動かす:
//   npm run test:rules
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const EDITOR = 'editor@example.com';
const PATH = 'prize-videos/t1/v1.mp4';
const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
const meta = (email: string, extra: object = {}) => ({
  contentType: 'video/mp4',
  customMetadata: { title: '優勝賞品', uploadedBy: email },
  ...extra,
});

const editor = () => env.authenticatedContext('u-editor', { email: EDITOR, email_verified: true }).storage();
const stranger = () => env.authenticatedContext('u-x', { email: 'x@example.com', email_verified: true }).storage();
const anon = () => env.unauthenticatedContext().storage();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // Storage のルールから Firestore を読むときはエミュレーターのプロジェクト (.firebaserc) を見るので合わせる
    projectId: 'by-splatoon',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'config/access'), { editors: [EDITOR] });
    await ctx.storage().ref(PATH).put(bytes, meta(EDITOR));
  });
});

describe('閲覧', () => {
  it('ログインしていなくても動画の一覧を見てダウンロードできる', async () => {
    await assertSucceeds(anon().ref(PATH).getMetadata());
    await assertSucceeds(anon().ref(PATH).getDownloadURL());
    await assertSucceeds(anon().ref('prize-videos/t1').listAll());
  });

  it('動画の置き場以外は読めない', async () => {
    await assertFails(anon().ref('other/x.mp4').getMetadata());
  });
});

describe('アップロード', () => {
  it('編集者は動画をアップロード・削除できる', async () => {
    await assertSucceeds(editor().ref('prize-videos/t1/v2.mp4').put(bytes, meta(EDITOR)));
    await assertSucceeds(editor().ref(PATH).delete());
  });

  it('未ログイン・編集者以外はアップロード・削除できない', async () => {
    await assertFails(anon().ref('prize-videos/t1/v2.mp4').put(bytes, meta('')));
    await assertFails(stranger().ref('prize-videos/t1/v2.mp4').put(bytes, meta('x@example.com')));
    await assertFails(stranger().ref(PATH).delete());
  });

  it('メール未確認のアカウントは編集者でもアップロードできない', async () => {
    const s = env.authenticatedContext('u-e2', { email: EDITOR, email_verified: false }).storage();
    await assertFails(s.ref('prize-videos/t1/v2.mp4').put(bytes, meta(EDITOR)));
  });

  it('動画以外のファイルは置けない', async () => {
    await assertFails(editor().ref('prize-videos/t1/x.png').put(bytes, meta(EDITOR, { contentType: 'image/png' })));
    await assertFails(editor().ref('other/v.mp4').put(bytes, meta(EDITOR)));
  });

  it('アップロードした人を偽ることはできない', async () => {
    await assertFails(editor().ref('prize-videos/t1/v2.mp4').put(bytes, meta('someone@example.com')));
  });

  it('既存の動画は上書きできない', async () => {
    await assertFails(editor().ref(PATH).put(bytes, meta(EDITOR)));
  });
});
