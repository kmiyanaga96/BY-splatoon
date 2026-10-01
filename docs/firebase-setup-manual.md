# Firebase セットアップ手順（作業用・完了したら削除）

BY スプラ大会ツールを Firebase につなぐための、**Google アカウントの持ち主が行う作業**の手順書です。
方針は [ADR 0001](architecture/0001-backend-selection.md) を参照。所要時間の目安は 30〜40 分です。

> Firebase / Google Cloud の画面は頻繁に名前や配置が変わります。メニュー名が違うときは、
> 画面上部の検索窓で「Firestore」「Billing」などと検索すると早いです。

## 0. 決めておく値

| 項目 | 推奨値 | メモ |
| --- | --- | --- |
| プロジェクト名 | `by-splatoon` | ID は自動で `by-splatoon-xxxxx` のようになる |
| Firestore の場所 | `asia-northeast1`（東京） | **作成後は変更できない** |
| Firestore のデータベース ID | `(default)` のまま | 無料分は default のデータベースに適用される |
| Storage の場所 | `us-central1` | 無料分（5 GB）が付くのは us-central1 / us-east1 / us-west1 のみ。アイコン程度なら東京でも月 1 円未満だが、無料に収めるならこちら |
| 予算アラート | 月 500 円 | アラートは通知だけで、**課金は止まらない**点に注意 |

## 1. Firebase プロジェクトを作る

1. https://console.firebase.google.com/ を開き、使う Google アカウントでログイン。
2. 「プロジェクトを作成」→ プロジェクト名を入力。
3. Google アナリティクスは **オフ** でよい（使わない）。
4. 作成が終わるまで待つ。

## 2. Blaze（従量課金）プランに切り替える

画像保存（Cloud Storage）に必須です。無料分は Blaze でもそのまま使えます。

1. Firebase コンソール左下のプラン表示（「Spark」）→「プランをアップグレード」。
2. 「Blaze」を選び、請求先アカウント（Cloud Billing アカウント）を作成または選択。
   - 初めてなら、ここでクレジットカードを登録して請求先アカウントを作る。
3. 途中で予算の設定を聞かれたら、月 500 円などを入力（あとから 4. でも設定できる）。

## 3. Google AI Pro のクレジット（月 $10）を適用する

自動では適用されません。

1. https://developers.google.com/program/my-benefits を開く（AI Pro に加入している Google アカウントで）。
2. Google Developer Program に未参加なら参加する（無料）。
3. 「$10 monthly Generative AI and Cloud credit」の項目で「Select billing account」→ 2. の請求先アカウントを選んで適用。
4. 確認：https://console.cloud.google.com/billing →「クレジット」に表示されていれば OK（反映まで少しかかることがある）。

## 4. 予算アラートを設定する

1. https://console.cloud.google.com/billing → 請求先アカウントを選択 →「予算とアラート」→「予算を作成」。
2. 対象プロジェクト：作ったプロジェクト。
3. 金額：500 円。しきい値：50% / 90% / 100%（初期値のままでよい）。
4. 通知先メール：自分（必要なら主催も）。

## 5. Web アプリを登録して設定値を控える

1. Firebase コンソール → プロジェクトの概要（歯車）→「プロジェクトの設定」→「マイアプリ」→ ウェブ（`</>`）アイコン。
2. アプリのニックネーム：`by-splatoon-web`。Firebase Hosting は **チェックしない**（GitHub Pages を使い続ける）。
3. 表示される `firebaseConfig` の値を控える：

```js
const firebaseConfig = {
  apiKey: '...',
  authDomain: '....firebaseapp.com',
  projectId: '...',
  storageBucket: '....firebasestorage.app',
  messagingSenderId: '...',
  appId: '...',
};
```

この値は秘密情報ではありません（ブラウザに配られる前提の値で、実際の保護は 9. のルールで行う）。
**開発者（Claude）に渡すのはこの値だけ**で OK です。パスワードや秘密鍵は渡さないでください。

## 6. ログイン（Authentication）を有効にする

1. 左メニュー「構築（Build）」→「Authentication」→「始める」。
2. 「Sign-in method」→「Google」→ 有効にする → プロジェクトのサポートメールを選んで保存。
3. 「設定（Settings）」→「承認済みドメイン（Authorized domains）」に次を追加：
   - `kmiyanaga96.github.io`（公開ページ）
   - `localhost` は最初から入っているはず（開発用）

パスワードやアカウント DB を自前で持つ必要はありません。ログインは Google アカウントで行い、
「誰が編集できるか」は 8. のメールアドレス一覧で管理します。

## 7. Firestore（データベース）を作る

1. 左メニュー「Databases & Storage」（または「構築」）→「Firestore」→「データベースを作成（Add database）」。
2. エディション：**Standard**。
3. データベース ID：**`(default)` のまま**。
4. ロケーション：**`asia-northeast1`（東京）**。
5. セキュリティルール：**本番環境モード（Production mode）**（いったん全拒否で始める。ルールは 9. で入れる）。

## 8. 編集できる人を登録する

ツールでは「閲覧はログイン不要・編集はここに登録したメールアドレスのみ」にする予定です。

1. Firestore の「データ」タブ →「コレクションを開始」。
2. コレクション ID：`config`、ドキュメント ID：`access`。
3. フィールドを追加：
   - フィールド名 `editors`、型 **array**、要素（string）に編集する人の Gmail アドレスを入れる（主催と開発者）。
4. 保存。

あとから編集者を増やすときは、この配列にメールアドレスを足すだけです。

## 9. Cloud Storage（画像置き場）を作る

1. 左メニュー「Databases & Storage」→「Storage」→「始める（Get started）」。
2. ロケーション：**`us-central1`**（無料分に収めたい場合。0. を参照）。
3. セキュリティルール：本番環境モード。

## 10. ルールについて（作業不要・参考）

Firestore と Storage のセキュリティルールは、開発者がリポジトリ（`firestore.rules` / `storage.rules`）に用意し、
Firebase CLI でまとめて反映します。予定している内容：

- 読み取り：誰でも可（ログイン不要。画面共有で見せる運用のため）
- 書き込み：`config/access.editors` にメールアドレスがある人だけ
- アイコン画像：1 枚 1 MB まで・画像形式のみ

反映のときに CLI でのログインが必要になったら、その時点で手順を案内します。

## 11. 開発者に渡すもの

- [ ] 5. の `firebaseConfig`（6 つの値）
- [ ] 6. で承認済みドメインを追加したこと
- [ ] 8. に登録したメールアドレス（確認用）
- [ ] 7. と 9. のロケーション

## 12. 完了チェック

- [ ] Blaze プランになっている（Firebase コンソール左下の表示）
- [ ] AI Pro のクレジットが請求先アカウントに表示されている
- [ ] 予算アラートが設定されている
- [ ] Google ログインが有効
- [ ] Firestore（東京）と Storage が作成済み
- [ ] `config/access` に編集者のメールアドレスが入っている
- [ ] 13. のセキュリティルールを反映した

## 13. セキュリティルールを反映する（実装後の作業・必須）

いまの Firestore は「本番環境モード（全拒否）」のままなので、**ルールを反映するまでアプリはデータを読めません**。
リポジトリの `firestore.rules` を反映してください。どちらか一方の方法で OK です。

### 方法 A：コンソールに貼り付ける（簡単）

1. Firebase コンソール → Firestore →「ルール」タブ。
2. エディタの中身をすべて消し、リポジトリの `firestore.rules` の中身を貼り付ける。
3. 「公開」を押す。

### 方法 B：コマンドで反映する

```sh
npx firebase login          # 初回のみ。ブラウザで Google アカウントを選ぶ
npm run deploy:rules        # firestore.rules を by-splatoon プロジェクトに反映
```

### 反映後の確認

1. 公開ページ（または `npm run dev`）を開く →「閲覧モード」の帯が出て、エラーにならないこと。
2. 右上「ログイン」→ 8. に登録したアカウントでログイン → 帯が消え、右上のアイコンに鉛筆マークが付くこと。
3. 設定 →「このブラウザに保存されていたデータをオンラインに取り込む」で、これまでのデータを移す
   （ボタンはこのブラウザに旧データがあるときだけ表示されます）。
4. 別のブラウザ（シークレットウィンドウなど）で開き、同じデータが見えること。

> Cloud Storage（9.）は結局使っていません（理由は ADR 参照）。作成済みのバケットは空のままで料金はかかりません。

全部終わったら、このファイルは削除して構いません。
