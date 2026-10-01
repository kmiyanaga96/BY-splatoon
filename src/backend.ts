// 起動時に保存先を決めてつなぐ。
// - 既定: Firebase (オンラインで共有。閲覧は誰でも、編集は編集者リストのアカウントだけ)
// - VITE_STORAGE=local でビルドすると、従来どおりこのブラウザの localStorage だけを使う

import { useSyncExternalStore } from 'react';
import { showSnackbar } from './components/ui';
import { connectStorage, markLoading, setEditGuard, startLocal } from './store';

export const STORAGE_MODE: 'local' | 'firebase' = import.meta.env.VITE_STORAGE === 'local' ? 'local' : 'firebase';

export interface AuthView {
  status: 'loading' | 'signedOut' | 'signedIn' | 'unavailable';
  email: string | null;
  name: string | null;
  photoURL: string | null;
  isEditor: boolean;
}

let authView: AuthView = {
  status: STORAGE_MODE === 'local' ? 'unavailable' : 'loading',
  email: null,
  name: null,
  photoURL: null,
  isEditor: STORAGE_MODE === 'local',
};
const listeners = new Set<() => void>();

function setAuthView(next: AuthView) {
  authView = next;
  for (const l of listeners) l();
}

export function useAuthView(): AuthView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => authView,
  );
}

function applyGuard() {
  setEditGuard(
    () => authView.isEditor,
    () =>
      showSnackbar(
        authView.status === 'signedIn'
          ? 'このアカウントには編集権限がありません（閲覧のみ）'
          : '閲覧モードです。編集するには右上からログインしてください',
      ),
  );
}

export async function startBackend() {
  if (STORAGE_MODE === 'local') {
    startLocal();
    return;
  }
  markLoading();
  applyGuard();
  const [{ firebaseAdapter }, auth] = await Promise.all([import('./storage/firebase'), import('./firebase/auth')]);
  auth.subscribeAuth((s) => {
    setAuthView({
      status: s.status,
      email: s.user?.email ?? null,
      name: s.user?.displayName ?? null,
      photoURL: s.user?.photoURL ?? null,
      isEditor: s.isEditor,
    });
    applyGuard(); // 画面の「編集できるか」の表示を更新
  });
  await connectStorage(firebaseAdapter);
}

export async function signIn() {
  try {
    const auth = await import('./firebase/auth');
    await auth.signIn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    showSnackbar(`ログインできませんでした（${code ?? e}）`);
  }
}

export async function signOut() {
  const auth = await import('./firebase/auth');
  await auth.signOut();
  showSnackbar('ログアウトしました');
}
