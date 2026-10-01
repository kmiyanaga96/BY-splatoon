// ブラウザの localStorage に全体を JSON で保存する。データはこのブラウザの中だけにある。

import type { StorageAdapter } from './types';

const KEY_V2 = 'by-splatoon:v2';
/** v1 (選手 DB 導入前) の保存キー。読み込めたら v2 に移して残しておく (戻せるように) */
const KEY_V1 = 'by-splatoon:v1';

function read(key: string): unknown | null {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

export const localStorageAdapter: StorageAdapter = {
  name: 'このブラウザ (localStorage)',

  async load() {
    return read(KEY_V2) ?? read(KEY_V1);
  },

  async save(data) {
    localStorage.setItem(KEY_V2, JSON.stringify(data));
  },

  subscribe(onRemoteChange) {
    const handler = (e: StorageEvent) => {
      if (e.key !== KEY_V2 || !e.newValue) return;
      try {
        onRemoteChange(JSON.parse(e.newValue));
      } catch {
        /* 壊れたデータは無視 */
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
};

/** 起動直後に画面を空で出さないよう、同期的に読む (localStorage 専用) */
export function loadLocalSync(): unknown | null {
  try {
    return read(KEY_V2) ?? read(KEY_V1);
  } catch (e) {
    console.warn('保存データの読み込みに失敗しました', e);
    return null;
  }
}
