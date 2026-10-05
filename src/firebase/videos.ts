// 表彰ページの「優勝賞品の動画」。Cloud Storage の prize-videos/{大会ID}/ に置く。
//   閲覧・ダウンロードは誰でも、アップロード・削除は編集者だけ (storage.rules)
// 動画の一覧は Storage のファイル一覧とメタデータから作る (Firestore には何も書かない)。
// 表彰ページを開いたときだけ読み込むよう、Storage の初期化もここで行う。

import {
  connectStorageEmulator,
  deleteObject,
  getDownloadURL,
  getMetadata,
  getStorage,
  listAll,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from 'firebase/storage';
import { app } from './app';
import { currentEmail } from './auth';

const storage = getStorage(app);
if (import.meta.env.VITE_FIREBASE_EMULATOR) connectStorageEmulator(storage, '127.0.0.1', 9199);

/** storage.rules と同じ上限 (想定は 1GB 以内、余裕をみて 2GB) */
export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;

export interface PrizeVideo {
  /** Storage 上のパス (削除に使う) */
  path: string;
  title: string;
  /** ダウンロードするときのファイル名 */
  fileName: string;
  size: number;
  contentType: string;
  uploadedAt: Date;
  uploadedBy: string;
  url: string;
}

const folder = (tournamentId: string) => `prize-videos/${tournamentId}`;

/** 大会の動画を新しい順に */
export async function listPrizeVideos(tournamentId: string): Promise<PrizeVideo[]> {
  const { items } = await listAll(ref(storage, folder(tournamentId)));
  const videos = await Promise.all(
    items.map(async (item): Promise<PrizeVideo> => {
      const [meta, url] = await Promise.all([getMetadata(item), getDownloadURL(item)]);
      const title = meta.customMetadata?.title || item.name;
      return {
        path: item.fullPath,
        title,
        fileName: fileNameOf(meta.contentDisposition) ?? item.name,
        size: meta.size,
        contentType: meta.contentType ?? '',
        uploadedAt: new Date(meta.timeCreated),
        uploadedBy: meta.customMetadata?.uploadedBy ?? '',
        url,
      };
    }),
  );
  return videos.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}

/** Content-Disposition の filename*=UTF-8''... からファイル名を取り出す */
function fileNameOf(disposition: string | undefined): string | null {
  const m = disposition?.match(/filename\*=UTF-8''([^;]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

const extensionOf = (file: File) => file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1].toLowerCase() ?? '';

/** 動画ファイルなら Content-Type を返す。ブラウザ・OS によっては種類が空になるので拡張子からも判断する */
export function videoTypeOf(file: File): string | null {
  if (file.type.startsWith('video/')) return file.type;
  return VIDEO_TYPES[extensionOf(file)] ?? null;
}

/** Content-Disposition の filename* 用 (encodeURIComponent が残す ' ( ) * も符号化する) */
const encodeRfc5987 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * 動画をアップロードする。進み具合は返り値の UploadTask で見る (on('state_changed') / cancel())。
 * ファイル名は ID にして日本語や記号を避け、元のファイル名はダウンロード時の名前 (Content-Disposition) に残す。
 */
export function uploadPrizeVideo(tournamentId: string, file: File, title: string): UploadTask {
  const email = currentEmail();
  if (!email) throw new Error('ログインしていないためアップロードできません');
  const contentType = videoTypeOf(file);
  if (!contentType) throw new Error('動画ファイルを選んでください');
  const ext = extensionOf(file) || Object.keys(VIDEO_TYPES).find((k) => VIDEO_TYPES[k] === contentType) || 'mp4';
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const item = ref(storage, `${folder(tournamentId)}/${id}.${ext}`);
  return uploadBytesResumable(item, file, {
    contentType,
    // attachment にしておくと、リンクを開いたときに再生ではなくダウンロードになる (別オリジンでも効く)
    contentDisposition: `attachment; filename*=UTF-8''${encodeRfc5987(file.name)}`,
    cacheControl: 'public, max-age=86400',
    customMetadata: { title: title.slice(0, 100), uploadedBy: email },
  });
}

export async function deletePrizeVideo(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}

/** 大会を削除するときに、その大会の動画もまとめて消す */
export async function deleteAllPrizeVideos(tournamentId: string): Promise<void> {
  const { items } = await listAll(ref(storage, folder(tournamentId)));
  await Promise.all(items.map((item) => deleteObject(item)));
}
