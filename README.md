# BY スプラ大会ツール

Discord サーバー「バックヤード（BY）」の内輪大会向け、スプラトゥーン3 **ブキ統一杯** の情報整理・告知ツールです。
大会の進行そのものは公式の「タイカイサポート」に任せ、こちらは
「各チームがどのブキを選べるのか」「注目選手は誰か」「どこまで勝ち進んだか」を
まとめて見せる・告知することに特化しています。

- 静的 Web アプリ（GitHub Pages）＋ Firebase（Firestore・Google ログイン）
- **大会・選手 DB は全員で共通の 1 つだけ**。誰かが作った大会・登録した選手は、全員の画面にすぐ反映される
- 閲覧はログイン不要、編集は編集者に登録した Google アカウントだけ
- 端末ごとに違うのは「いまどの大会を表示しているか」だけ（初期表示は一番新しい大会）

## できること

| 画面 | 内容 |
| --- | --- |
| ホーム | 大会概要、進行状況、次の試合、注目選手、ルール |
| チーム | チーム登録（名前・カラー・紹介文）、メンバー（選手 DB から選ぶ／その場で登録）、注目選手・リーダー、**候補ブキの登録** |
| 選手 | 大会をまたいで使う**選手 DB**。アイコン・Xパワー・得意ブキを一度登録すれば全大会で共通。出場大会の成績・よく使うブキ・勝率を集計 |
| ブキ表 | ブキ × チームの一覧。どのチームがどのブキを候補にし、何回使ったか / もう使えないかを一目で確認 |
| トーナメント | シングルエリミネーション表の自動生成（シード順 / ランダム、不戦勝あり）、1回戦の枠の手動編集、各試合のゲームごとの **使用ブキ・ルール・ステージ・勝敗** の記録 |
| 告知 | Discord に貼れる告知文を生成（大会概要、チーム紹介、注目選手、対戦カード、試合結果、ブキ使用状況）。2000 文字を超える場合は分割コピー |
| 表彰 | テンプレート見本（3 種）を常時表示。大会後の表彰画像（1600×900 PNG）を作成。テンプレート（ポップ / チーム色 / シンプル）に成績・チーム名・メンバー（アイコン・Xパワーバッジ）・使用ブキを流し込み、PNG 保存または画像コピーで Discord に貼れる |
| 設定 | 大会情報、ブキ統一ルール、大会の追加・複製・削除、全データのバックアップ保存 |

### ブキ統一ルールの設定項目

- 候補ブキの登録上限（例: 3 種）
- ブキの再使用: 制限なし / 同じ試合内では不可 / 大会を通して不可
  - 試合記録の入力時、ルール上使えないブキは選択不可になります
- 他チームと同じ候補ブキの登録を許可するか
- 1 チームの人数、通常試合 / 決勝の BO 数

### Xパワーバッジ

選手の「Xパワー」に数値を入れると、2500 / 2700 / 3000 以上で名前の横にバッジが付きます（チーム一覧・ホーム・表彰画像など）。
バッジは六角形に「X」を入れたオリジナルの SVG（`src/lib/xbadge.ts`）で、2500 = 緑、2700 = 紫、3000 = 金（上部の飾りの数でも区別）。
色は `X_TIERS` で調整できます。

### 選手アイコン

選手ページ・チーム編集画面・表彰ページで設定できます（画像ファイル選択 / Ctrl+V で貼り付け / 画像 URL）。
選手 DB に保存されるので、一度設定すれば次の大会でもそのまま使えます。
Discord との連携はしていないため、Discord のプロフィールからアイコン画像をコピーして貼り付けてください。
画像は 192px の正方形に縮小してブラウザ内に保存します（JSON 書き出しにも含まれます）。

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

### 保存先

- Firestore の構成：`players/{id}`（選手 DB）、`tournaments/{id}`（大会）、`config/access`（`editors`: 編集できるメールアドレスの配列。コンソールで編集）
- 全員が同じデータを読み書きする（大会ごとの「共有」や JSON での受け渡しはない）。
- アクセス制御は `firestore.rules`。変更したら `npm run test:rules`（エミュレーターでテスト）→ `npm run deploy:rules`（要 `npx firebase login`）
- エミュレーターで動かす：`npm run emulators` を起動したまま `VITE_FIREBASE_EMULATOR=1 npm run dev`
  （エミュレーターではログイン時にメールアドレスを入力するだけでログインできる。編集者にするには
  エミュレーターの Firestore に `config/access` を作る）
- バックアップ：設定ページの「全データのバックアップを保存」で JSON を保存できる（復元は開発者が行う）

### ブキアイコン

`public/weapons/<ブキID>.png` に公式のブキアイコンを置いています（ブキタグ・ブキ表・選手ページ・表彰画像で表示）。
新ブキが追加されたら、ブキデータを更新したあとに次を実行してください。

```sh
npm run update-weapon-icons
```

### ブキ・ステージデータの更新

`src/data/weapons.json` / `stages.json` は [Leanny/splat3](https://github.com/Leanny/splat3) のゲームデータから生成しています。
新ブキが追加されたら、同リポジトリ `data/mush/` の最新バージョン番号を指定して再生成してください。

```sh
npm run update-weapons -- 1120
```

## 今後の構成変更

選手の DB 化・ログイン対応に向けたバックエンドの選定と移行計画は
[docs/architecture/0001-backend-selection.md](docs/architecture/0001-backend-selection.md) を参照。

## 構成

```
src/
  types.ts            データ型（保存形式）
  model.ts            データの生成・補完・旧形式からの移行
  store.ts            状態管理・差分の保存・インポート/エクスポート
  storage/            保存先 (localStorage 版 / Firebase 版)
  firebase/           Firebase の初期化・Google ログイン
  backend.ts          起動時の保存先の選択・編集権限
firestore.rules       Firestore のアクセス制御
tests/                ルールのテスト (エミュレーターで実行)
  data/               ブキ・ステージデータ
  lib/bracket.ts      トーナメント計算（勝者は記録から毎回導出）
  lib/usage.ts        ブキ使用状況・再使用ルール
  lib/stats.ts        選手ごとの成績・使用ブキの集計
  lib/award.ts        表彰画像の描画
  lib/announce.ts     告知文の生成
  pages/              各画面
  components/         共通 UI（ブキ選択など）
```
