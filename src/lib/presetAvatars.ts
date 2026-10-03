// 選手アイコンのデフォルト画像。画像を用意しない人向けに、Nintendo Switch Online で配布された
// スプラトゥーンの公式アイコン (public/avatars/w<週>-<番号>.jpg、配布週ごとに 8 種) から選べるようにする。
// 選んだときに読み込んで、取り込んだ画像と同じ 192px の JPEG data URL にして保存する。
// 画像そのものを保存するので、あとから並べ替え・削除しても設定済みの選手には影響しない。

/** 配布された週の数。画像を足したら増やす */
const WEEKS = 4;
const PER_WEEK = 8;

export const PRESET_AVATARS: { id: string; url: string }[] = Array.from({ length: WEEKS * PER_WEEK }, (_, i) => {
  const id = `w${Math.floor(i / PER_WEEK) + 1}-${(i % PER_WEEK) + 1}`;
  return { id, url: `${import.meta.env.BASE_URL}avatars/${id}.jpg` };
});
