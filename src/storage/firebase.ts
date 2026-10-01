// Firestore に選手・大会を 1 件 1 ドキュメントで保存する。
//   players/{playerId}       選手 DB (アイコンは縮小済みの data URL をそのまま持つ)
//   tournaments/{id}         大会 (チーム・トーナメント表・試合記録を含む)
//   config/access            { editors: [メールアドレス] } 編集できる人 (コンソールで管理)

import { collection, doc, getDocs, onSnapshot, serverTimestamp, writeBatch, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase/app';
import { currentEmail } from '../firebase/auth';
import type { StorageAdapter } from './types';

const BATCH_LIMIT = 400;

export const firebaseAdapter: StorageAdapter = {
  name: 'Firebase（オンラインで共有）',
  debounceMs: 800,

  async load() {
    const [players, tournaments] = await Promise.all([
      getDocs(collection(db, 'players')),
      getDocs(collection(db, 'tournaments')),
    ]);
    return {
      version: 2,
      players: players.docs.map((d) => d.data()),
      tournaments: tournaments.docs.map((d) => d.data()),
    };
  },

  async save(_data, changes) {
    const email = currentEmail();
    if (!email) throw new Error('ログインしていないため保存できません');
    const stamp = { updatedAt: serverTimestamp(), updatedBy: email };
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    for (const p of changes.players.upserted) ops.push((b) => b.set(doc(db, 'players', p.id), { ...p, ...stamp }));
    for (const id of changes.players.deleted) ops.push((b) => b.delete(doc(db, 'players', id)));
    for (const t of changes.tournaments.upserted) ops.push((b) => b.set(doc(db, 'tournaments', t.id), { ...t, ...stamp }));
    for (const id of changes.tournaments.deleted) ops.push((b) => b.delete(doc(db, 'tournaments', id)));
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
      await batch.commit();
    }
  },

  subscribe(onRemoteChange) {
    let players: DocumentData[] | null = null;
    let tournaments: DocumentData[] | null = null;
    const emit = () => {
      if (players && tournaments) onRemoteChange({ version: 2, players, tournaments });
    };
    const onError = (e: unknown) => console.warn('Firestore の購読に失敗しました', e);
    // 自分の書き込みがサーバーに届く前の途中状態 (hasPendingWrites) は無視し、確定した内容だけ反映する
    const unsubPlayers = onSnapshot(
      collection(db, 'players'),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        players = snap.docs.map((d) => d.data());
        emit();
      },
      onError,
    );
    const unsubTournaments = onSnapshot(
      collection(db, 'tournaments'),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        tournaments = snap.docs.map((d) => d.data());
        emit();
      },
      onError,
    );
    return () => {
      unsubPlayers();
      unsubTournaments();
    };
  },
};
