// Firestore のセキュリティルールのテスト。エミュレーター上で動かす:
//   npm run test:rules
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const EDITOR = 'editor@example.com';
const stamp = (email: string) => ({ updatedAt: serverTimestamp(), updatedBy: email });
const player = (id: string, extra: object = {}) => ({ id, name: 'イカ', discord: '', xp: 2600, avatar: '', mains: [], note: '', ...extra });
const tournament = (id: string) => ({
  id,
  name: '杯',
  date: '',
  description: '',
  rules: { poolMax: 3 },
  teams: [{ id: 't', name: 'A', members: [{ playerId: 'p1', leader: true, featured: false, comment: '' }], pool: [] }],
  bracket: { slots: ['t', null], matches: { '0-0': { a: 't', b: 'u', games: [{ lineupA: null, lineupB: ['p1'] }] } } },
});

const editor = () => env.authenticatedContext('u-editor', { email: EDITOR, email_verified: true }).firestore();
const stranger = () => env.authenticatedContext('u-x', { email: 'x@example.com', email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'by-splatoon-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'config/access'), { editors: [EDITOR] });
    await setDoc(doc(ctx.firestore(), 'players/p1'), player('p1'));
  });
});

describe('閲覧', () => {
  it('ログインしていなくても選手・大会を読める', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'players/p1')));
    await assertSucceeds(getDoc(doc(anon(), 'tournaments/x')));
  });

  it('編集者リストはログインしないと読めない', async () => {
    await assertFails(getDoc(doc(anon(), 'config/access')));
    await assertSucceeds(getDoc(doc(stranger(), 'config/access')));
  });
});

describe('書き込み', () => {
  it('編集者は選手・大会を作成・更新・削除できる', async () => {
    const db = editor();
    await assertSucceeds(setDoc(doc(db, 'players/p2'), { ...player('p2', { avatar: 'data:image/jpeg;base64,AAAA' }), ...stamp(EDITOR) }));
    await assertSucceeds(setDoc(doc(db, 'tournaments/t1'), { ...tournament('t1'), ...stamp(EDITOR) }));
    await assertSucceeds(deleteDoc(doc(db, 'players/p2')));
  });

  it('未ログイン・編集者以外は書き込めない', async () => {
    await assertFails(setDoc(doc(anon(), 'players/p3'), { ...player('p3'), ...stamp('') }));
    await assertFails(setDoc(doc(stranger(), 'players/p3'), { ...player('p3'), ...stamp('x@example.com') }));
    await assertFails(deleteDoc(doc(stranger(), 'players/p1')));
  });

  it('メール未確認のアカウントは編集者でも書き込めない', async () => {
    const db = env.authenticatedContext('u-e2', { email: EDITOR, email_verified: false }).firestore();
    await assertFails(setDoc(doc(db, 'players/p3'), { ...player('p3'), ...stamp(EDITOR) }));
  });

  it('編集者リストはアプリから書き換えられない', async () => {
    await assertFails(setDoc(doc(editor(), 'config/access'), { editors: [EDITOR, 'x@example.com'] }));
  });

  it('記録者を偽ることはできない', async () => {
    await assertFails(setDoc(doc(editor(), 'players/p4'), { ...player('p4'), ...stamp('someone@example.com') }));
  });

  it('形式がおかしいデータは拒否する', async () => {
    const db = editor();
    await assertFails(setDoc(doc(db, 'players/p5'), { ...player('p5'), hacked: true, ...stamp(EDITOR) }));
    await assertFails(setDoc(doc(db, 'players/p6'), { ...player('other'), ...stamp(EDITOR) }));
    await assertFails(setDoc(doc(db, 'players/p7'), { ...player('p7', { avatar: 'javascript:alert(1)' }), ...stamp(EDITOR) }));
    await assertFails(setDoc(doc(db, 'players/p8'), { ...player('p8', { avatar: 'data:image/jpeg;base64,' + 'A'.repeat(300001) }), ...stamp(EDITOR) }));
    await assertFails(setDoc(doc(db, 'players/p9'), { ...player('p9', { xp: 'many' }), ...stamp(EDITOR) }));
    await assertFails(setDoc(doc(db, 'tournaments/t2'), { ...tournament('t2'), teams: 'x', ...stamp(EDITOR) }));
    await assertFails(setDoc(doc(db, 'tournaments/t3'), { ...tournament('t3'), league: 'x', ...stamp(EDITOR) }));
    await assertFails(setDoc(doc(db, 'tournaments/t4'), { ...tournament('t4'), league: { groups: 'x', matches: {} }, ...stamp(EDITOR) }));
  });

  it('予選リーグを持つ大会を保存できる', async () => {
    const league = { groups: [{ id: 'A', name: 'Aグループ', teamIds: ['t'] }], advance: 2, bestOf: 3, tiebreakers: ['wins'], matches: {} };
    await assertSucceeds(setDoc(doc(editor(), 'tournaments/t5'), { ...tournament('t5'), league, ...stamp(EDITOR) }));
  });

  it('その他のコレクションには書き込めない', async () => {
    await assertFails(setDoc(doc(editor(), 'misc/x'), { a: 1 }));
  });
});
