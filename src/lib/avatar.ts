// 選手アイコン画像の取り込み。localStorage に入れるので正方形に切り抜いて小さく縮小する。

const SIZE = 192;

export async function blobToAvatar(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) throw new Error('画像ファイルではありません');
  const bmp = await createImageBitmap(blob);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // 透過 PNG を JPEG にするときの下地
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * 画像 URL から取り込む。Discord のアイコン URL (cdn.discordapp.com/avatars/...) を想定。
 * 配信元が CORS を許可していないと失敗するので、その場合は画像を保存してファイルで選んでもらう。
 */
export async function urlToAvatar(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url.trim(), { mode: 'cors' });
  } catch {
    throw new Error('画像を取得できませんでした（相手のサイトが外部からの読み込みを許可していない可能性があります）');
  }
  if (!res.ok) throw new Error(`画像を取得できませんでした (${res.status})`);
  return blobToAvatar(await res.blob());
}
