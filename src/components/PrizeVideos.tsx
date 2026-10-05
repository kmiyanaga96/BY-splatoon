import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthView } from '../backend';
import type { UploadTask } from 'firebase/storage';
import type { PrizeVideo } from '../firebase/videos';
import type { Tournament } from '../types';
import { Empty, Field, Icon, IconButton, showSnackbar } from './ui';

// Storage の SDK は表彰ページを開いたときだけ読み込む
const loadVideos = () => import('../firebase/videos');

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

interface Uploading {
  name: string;
  sent: number;
  total: number;
  cancel: () => void;
}

/**
 * 表彰ページの「優勝賞品の動画」。誰でも (ログインなしで) 再生・ダウンロードでき、編集者だけがアップロード・削除できる。
 * 1〜3 分 (大きくても 1GB) の動画を想定。
 */
export function PrizeVideos({ t }: { t: Tournament }) {
  const auth = useAuthView();
  const [videos, setVideos] = useState<PrizeVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState<Uploading | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const { listPrizeVideos } = await loadVideos();
      setVideos(await listPrizeVideos(t.id));
      setError(null);
    } catch (e) {
      console.warn('動画の一覧を読み込めませんでした', e);
      setError((e as { code?: string }).code ?? String(e));
    }
  }, [t.id]);

  useEffect(() => {
    setVideos(null);
    setError(null);
    reload();
  }, [reload]);

  // アップロード中にページを閉じようとしたら確認を出す (閉じると途中で止まる)
  useEffect(() => {
    if (!uploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [uploading]);

  const upload = async (file: File) => {
    const { MAX_VIDEO_BYTES, uploadPrizeVideo, videoTypeOf } = await loadVideos();
    if (!videoTypeOf(file)) {
      showSnackbar('動画ファイルを選んでください');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      showSnackbar(`ファイルが大きすぎます（${formatBytes(file.size)}）。${formatBytes(MAX_VIDEO_BYTES)} までにしてください`);
      return;
    }
    const name = title.trim() || `${t.name} 優勝賞品`;
    let task: UploadTask;
    try {
      task = uploadPrizeVideo(t.id, file, name);
    } catch (e) {
      showSnackbar(e instanceof Error ? e.message : String(e));
      return;
    }
    setUploading({ name, sent: 0, total: file.size, cancel: () => task.cancel() });
    task.on('state_changed', (s) => setUploading((u) => u && { ...u, sent: s.bytesTransferred, total: s.totalBytes }));
    try {
      await task;
      showSnackbar('動画をアップロードしました');
      setTitle('');
      await reload();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'storage/canceled') showSnackbar('アップロードを中止しました');
      else if (code === 'storage/unauthorized') showSnackbar('アップロードする権限がありません（編集者のアカウントでログインしてください）');
      else showSnackbar(`アップロードに失敗しました（${code ?? e}）`);
    } finally {
      setUploading(null);
    }
  };

  const remove = async (v: PrizeVideo) => {
    if (!confirm(`動画「${v.title}」を削除しますか？\nダウンロードできなくなり、取り消せません。`)) return;
    try {
      const { deletePrizeVideo } = await loadVideos();
      await deletePrizeVideo(v.path);
      showSnackbar('動画を削除しました');
    } catch (e) {
      showSnackbar(`削除できませんでした（${(e as { code?: string }).code ?? e}）`);
    }
    await reload();
  };

  return (
    <section className="card prize-videos">
      <h2 className="card-title">優勝賞品の動画</h2>
      <p className="muted body-s">
        ログインしなくても、誰でも再生・ダウンロードできます。アップロード・削除は編集者のアカウントでログインしているときだけできます。
      </p>

      {auth.isEditor && (
        <div className="prize-upload">
          <Field label="タイトル" hint="空欄なら「大会名 優勝賞品」">
            <input
              className="input"
              value={title}
              maxLength={100}
              placeholder={`${t.name} 優勝賞品`}
              disabled={!!uploading}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload(file);
            }}
          />
          {uploading ? (
            <div className="prize-progress" role="status">
              <div className="prize-progress-text">
                <span className="body-s">
                  「{uploading.name}」をアップロード中… {formatBytes(uploading.sent)} / {formatBytes(uploading.total)}
                </span>
                <span className="spacer" />
                <button className="btn text small" onClick={uploading.cancel}>
                  <Icon name="close" />
                  中止
                </button>
              </div>
              <progress max={uploading.total} value={uploading.sent} />
              <span className="muted body-s">終わるまでこのページを閉じないでください。</span>
            </div>
          ) : (
            <button className="btn filled" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" />
              動画をアップロード
            </button>
          )}
        </div>
      )}

      {error ? (
        <div className="banner error">
          <Icon name="warning" />
          {error === 'storage/unauthorized'
            ? '動画の置き場の準備ができていません（Storage のルールが未反映）。'
            : `動画の一覧を読み込めませんでした（${error}）。`}
        </div>
      ) : videos === null ? (
        <div className="loading" role="status">
          <span className="spinner" />
          読み込んでいます…
        </div>
      ) : videos.length === 0 ? (
        <Empty icon="movie">まだ動画はありません</Empty>
      ) : (
        <ul className="prize-list">
          {videos.map((v) => (
            <li key={v.path} className="prize-item">
              {/* preload="none": 再生ボタンを押すまで読み込まない (通信量を抑える) */}
              <video className="prize-video" src={v.url} controls preload="none" playsInline />
              <div className="prize-meta">
                <span className="title-m">{v.title}</span>
                <span className="muted body-s">
                  {formatBytes(v.size)}・{v.uploadedAt.toLocaleDateString('ja-JP')}
                </span>
              </div>
              <div className="prize-actions">
                <a className="btn filled" href={v.url} download={v.fileName}>
                  <Icon name="download" />
                  ダウンロード
                </a>
                {auth.isEditor && <IconButton icon="delete" label="動画を削除" onClick={() => remove(v)} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
