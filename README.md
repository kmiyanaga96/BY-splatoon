# BY スプラ大会ツール

Discord サーバー「バックヤード（BY）」の内輪大会向け、スプラトゥーン3 **ブキ統一杯** の情報整理・告知ツールです。
大会の進行そのものは公式の「タイカイサポート」に任せ、こちらは
「各チームがどのブキを選べるのか」「注目選手は誰か」「どこまで勝ち進んだか」を
まとめて見せる・告知することに特化しています。

- サーバー・ログイン不要の静的 Web アプリ（データはブラウザの localStorage に自動保存）
- 運営メンバー間の受け渡しは JSON ファイルの書き出し / 読み込み

## できること

| 画面 | 内容 |
| --- | --- |
| ホーム | 大会概要、進行状況、次の試合、注目選手、ルール |
| チーム | チーム登録（名前・カラー・紹介文）、メンバー（XP・得意ブキ・注目/リーダー）、**候補ブキの登録** |
| ブキ表 | ブキ × チームの一覧。どのチームがどのブキを候補にし、何回使ったか / もう使えないかを一目で確認 |
| トーナメント | シングルエリミネーション表の自動生成（シード順 / ランダム、不戦勝あり）、1回戦の枠の手動編集、各試合のゲームごとの **使用ブキ・ルール・ステージ・勝敗** の記録 |
| 告知 | Discord に貼れる告知文を生成（大会概要、チーム紹介、注目選手、対戦カード、試合結果、ブキ使用状況）。2000 文字を超える場合は分割コピー |
| 設定 | 大会情報、ブキ統一ルール、大会の追加・複製・削除、データの書き出し / 読み込み |

### ブキ統一ルールの設定項目

- 候補ブキの登録上限（例: 3 種）
- ブキの再使用: 制限なし / 同じ試合内では不可 / 大会を通して不可
  - 試合記録の入力時、ルール上使えないブキは選択不可になります
- 他チームと同じ候補ブキの登録を許可するか
- 1 チームの人数、通常試合 / 決勝の BO 数

### 画面共有モード

右上の画面共有ボタンをオンにすると、全体の文字とレイアウトが大きくなります（Discord の画面共有で読みやすくするため）。
この設定は端末ごとに保存されます。

## デザイン・フォント

- UI は [Material Design 3](https://m3.material.io/) に沿っています。配色はシード色 `#5b3cf0` から
  [material-color-utilities](https://github.com/material-foundation/material-color-utilities) で生成したものです（`src/styles.css` 冒頭）。
- 見出し: [Dela Gothic One](https://fonts.google.com/specimen/Dela+Gothic+One)（SIL Open Font License）
- 本文: [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)、アイコン: [Material Symbols](https://fonts.google.com/icons)
- いずれも Google Fonts から読み込みます。新しいアイコンを使うときは `index.html` の `icon_names`（アルファベット順）に名前を追加してください。
- スプラトゥーン風フォントについて: 有志の「イカモドキ」は作者により配布が終了しており、現在出回っているファイルは無断再配布のため使っていません。
  「Splatfont 2」などはゲーム内フォントそのもの（任天堂の著作物）なので使っていません。

## 使い方（開発・ローカル実行）

Node.js 20.19 以降（22 推奨）が必要です。

```sh
npm install
npm run dev        # 開発サーバー (http://localhost:5173)
npm test           # トーナメント計算・ブキ使用ルールのテスト
npm run build      # dist/ に静的ファイルを出力
```

## 公開（GitHub Pages）

`.github/workflows/deploy.yml` により、`main` ブランチへの push で自動的にビルド・公開されます。
初回のみリポジトリの **Settings → Pages → Source** を「GitHub Actions」に設定してください。

`dist/` は相対パスで動くので、Netlify / Cloudflare Pages など他の静的ホスティングにもそのまま置けます。

## データについて

- 保存先: ブラウザの localStorage（キー `by-splatoon:v1`）。同じブラウザなら閉じても残ります。
  ブラウザのデータ削除やシークレットウィンドウでは消えるので、大会前後は「設定 → この大会を書き出し」でバックアップしてください。
- 共有: 書き出した JSON を Discord 等で渡し、相手が「JSON を読み込む」で取り込みます（同じ大会は上書き）。

### ブキ・ステージデータの更新

`src/data/weapons.json` / `stages.json` は [Leanny/splat3](https://github.com/Leanny/splat3) のゲームデータから生成しています。
新ブキが追加されたら、同リポジトリ `data/mush/` の最新バージョン番号を指定して再生成してください。

```sh
npm run update-weapons -- 1120
```

## 構成

```
src/
  types.ts            データ型（保存形式）
  store.ts            状態管理・localStorage 保存・インポート/エクスポート
  data/               ブキ・ステージデータ
  lib/bracket.ts      トーナメント計算（勝者は記録から毎回導出）
  lib/usage.ts        ブキ使用状況・再使用ルール
  lib/announce.ts     告知文の生成
  pages/              各画面
  components/         共通 UI（ブキ選択など）
```
