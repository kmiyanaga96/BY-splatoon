import { useRef, useState, type ClipboardEvent } from 'react';
import { blobToAvatar, urlToAvatar } from '../lib/avatar';
import { PRESET_AVATARS } from '../lib/presetAvatars';
import { Avatar, IconButton, Modal, showSnackbar } from './ui';

/**
 * 選手アイコンの設定。ファイル選択・クリップボードからの貼り付け・画像 URL・デフォルト画像からの選択に対応。
 * Discord では プロフィール → アイコンをクリック → 「画像をコピー」/「リンクをコピー」で取り出せる。
 */
export function AvatarInput(props: { name: string; color: string; value: string; onChange: (v: string) => void; size?: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    try {
      props.onChange(await task());
      showSnackbar('アイコンを設定しました');
    } catch (e) {
      showSnackbar(e instanceof Error ? e.message : '画像を読み込めませんでした');
    } finally {
      setBusy(false);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      run(() => blobToAvatar(file));
      return;
    }
    const text = e.clipboardData.getData('text').trim();
    if (/^https?:\/\//.test(text)) {
      e.preventDefault();
      run(() => urlToAvatar(text));
    }
  };

  const fromUrl = () => {
    const url = prompt('画像の URL を入力してください（Discord のアイコンなら「リンクをコピー」した URL）');
    if (url) run(() => urlToAvatar(url));
  };

  return (
    <div
      className={`avatar-input ${busy ? 'busy' : ''}`}
      tabIndex={0}
      onPaste={onPaste}
      title="クリックしてから Ctrl+V（⌘V）で画像や画像URLを貼り付けできます"
    >
      <button type="button" className="avatar-button" onClick={() => fileRef.current?.click()} aria-label="アイコン画像を選ぶ">
        <Avatar name={props.name} src={props.value} color={props.color} size={props.size ?? 56} />
      </button>
      <div className="avatar-actions">
        <IconButton icon="add_photo_alternate" label="画像ファイルを選ぶ" onClick={() => fileRef.current?.click()} />
        <IconButton icon="link" label="画像URLから設定" onClick={fromUrl} />
        <IconButton icon="palette" label="デフォルト画像から選ぶ" onClick={() => setPicking(true)} />
        {props.value && <IconButton icon="delete" label="アイコンを削除" onClick={() => props.onChange('')} />}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(() => blobToAvatar(f));
          e.target.value = '';
        }}
      />
      {picking && (
        <Modal title="デフォルト画像から選ぶ" onClose={() => setPicking(false)}>
          <div className="preset-avatars">
            {PRESET_AVATARS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset-avatar ${props.value === p.url ? 'selected' : ''}`}
                aria-pressed={props.value === p.url}
                title={p.label}
                onClick={() => {
                  props.onChange(p.url);
                  setPicking(false);
                  showSnackbar('アイコンを設定しました');
                }}
              >
                <Avatar name={props.name} src={p.url} color={props.color} size={64} />
                <span className="preset-avatar-label">{p.label}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
