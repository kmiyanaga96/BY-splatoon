// Firebase の初期化。設定値はブラウザに配られる前提の公開情報 (秘密情報ではない)。
// 実際のアクセス制御は firestore.rules で行う。

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCQpPRspPaTx_X2ChceKCcQKDSau2Dakuw',
  authDomain: 'by-splatoon.firebaseapp.com',
  projectId: 'by-splatoon',
  storageBucket: 'by-splatoon.firebasestorage.app',
  messagingSenderId: '478418497332',
  appId: '1:478418497332:web:4448d7887d313b21e97f61',
};

export const app = initializeApp(firebaseConfig);

// 一度読んだデータはブラウザに保存しておき、次回は即表示・オフラインでも閲覧できるようにする
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);

// 開発・テスト用: VITE_FIREBASE_EMULATOR=1 でビルドするとローカルのエミュレーターにつなぐ
if (import.meta.env.VITE_FIREBASE_EMULATOR) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
