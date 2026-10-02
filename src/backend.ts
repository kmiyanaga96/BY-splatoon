// 起動時に Firebase (Firestore) につなぐ。データは全員で共通の 1 つだけ。
// 閲覧は誰でも、編集は編集者リスト (config/access.editors) のアカウントだけ。

import { useSyncExternalStore } from 'react';
import { showSnackbar } from './components/ui';
import { connectStorage, markLoading, setEditGuard } from './store';

export interface AuthView {
  status: 'loading' | 'signedOut' | 'signedIn';
  email: string | null;
  name: string | null;
  photoURL: string | null;
  isEditor: boolean;
}

let authView: AuthView = {
  status: 'loading',
  email: null,
  name: null,
  photoURL: null,
  isEditor: false,
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
