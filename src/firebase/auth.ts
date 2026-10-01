// Google ログインと編集権限。編集できるのは Firestore の config/access.editors に載っているメールアドレスだけ。

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './app';

export interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
  isEditor: boolean;
}

let state: AuthState = { status: 'loading', user: null, isEditor: false };
const listeners = new Set<(s: AuthState) => void>();

function set(next: AuthState) {
  state = next;
  for (const l of listeners) l(state);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    set({ status: 'signedOut', user: null, isEditor: false });
    return;
  }
  let isEditor = false;
  try {
    const access = await getDoc(doc(db, 'config', 'access'));
    const editors: unknown = access.data()?.editors;
    isEditor = Array.isArray(editors) && !!user.email && editors.includes(user.email);
  } catch (e) {
    console.warn('編集権限の確認に失敗しました', e);
  }
  set({ status: 'signedIn', user, isEditor });
});

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(l: (s: AuthState) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export async function signIn() {
  if (import.meta.env.VITE_FIREBASE_EMULATOR) {
    // エミュレーターでは Google の画面を経由せず、入力したメールアドレスでログインする (テスト用)
    const email = prompt('エミュレーター用: ログインするメールアドレス');
    if (!email) return;
    const fakeIdToken = JSON.stringify({ sub: email, email, email_verified: true, name: email.split('@')[0] });
    await signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken));
    return;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signOut() {
  await fbSignOut(auth);
}

export function currentEmail(): string | null {
  return auth.currentUser?.email ?? null;
}
