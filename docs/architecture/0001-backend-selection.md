# ADR 0001: バックエンド（DB・認証・画像保存）の選定と移行計画

- 状態: **採用**（2026-10-01 に開発者が Firebase で進めることを決定）
- 作成日: 2026-10-01

## 1. 背景

これまでは「サーバーなし・localStorage 保存・JSON で受け渡し」で運用してきた。
主催からのフィードバックで、次の要望が出ている。

1. **選手の DB 化**：選手を大会をまたいで管理し、直近の成績や使用頻度の高いブキを集計したい。アイコンを大会ごとに設定し直す手間をなくしたい。
2. **アイコン表示**：表彰画像や使用頻度の表示で、ブキを公式のアイコン画像で見せたい。
3. **ログイン**：選手データを扱うので、localStorage ではなくログインしてデータを保存・共有したい。長く使う前提なので、無料枠頼みではなく継続して払える構成にしたい（Google AI Pro に加入済み）。

## 2. 規模の見積もり（内輪サーバー想定）

| 項目 | 見込み |
| --- | --- |
| 選手 | 〜200 人 |
| 大会 | 月 1〜4 回、1 大会 8〜16 チーム |
| 編集する人（運営） | 2〜5 人 |
| 1 大会のデータ | 〜50 KB（チーム・試合記録込み） |
| 選手アイコン | 1 枚 20 KB 前後（192px に縮小）→ 合計 〜4 MB |
| ブキアイコン | 173 種 × 約 15 KB → 約 2.7 MB（**静的ファイルで足りる**。後述） |

どの候補でも、**容量・アクセス数ともに無料分〜月数百円の範囲に収まる規模**。
選定で重視するのは「止まらない（休止しない）こと」「運用の手間」「Google アカウントとの相性」。

## 3. 候補の比較

| | Firebase（Blaze プラン） | Supabase Pro | Cloudflare（Workers + D1 + R2） | Google スプレッドシート + Apps Script | Cloud SQL + Cloud Run |
| --- | --- | --- | --- | --- | --- |
| DB | Firestore（NoSQL） | PostgreSQL | SQLite（D1） | シート | PostgreSQL |
| 画像 | Cloud Storage | Storage | R2 | Google ドライブ | Cloud Storage |
| ログイン | Firebase Auth（Google ログインが標準） | Supabase Auth（Discord ログインも標準） | 自前実装 | Google アカウント | 自前実装 |
| サーバーのコード | 不要（ブラウザから直接・ルールで保護） | 不要 | 必要（Worker で API を書く） | 必要（Apps Script） | 必要 |
| 月額の目安 | **ほぼ 0 円**（無料分を超えた分だけ従量課金） | **$25〜** | 0 円（無料枠内）／超えたら $5〜 | 0 円 | **$10 前後〜**（最小インスタンスでも常時課金） |
| 休止 | なし | なし（Free は 1 週間アクセスがないと休止） | なし | なし | なし |
| AI Pro の $10/月 クレジット | **使える** | 使えない | 使えない | 対象外（そもそも無料） | 使える |
| 集計（成績・使用頻度） | ブラウザ側で計算（データが小さいので問題なし） | SQL で書ける | SQL で書ける | 遅い | SQL で書ける |
| 気になる点 | 複雑な検索は苦手 | 費用が規模に対して割高 | 認証・API を自分で書く量が多い | 同時編集・速度・画像配信に弱い | 規模に対して過剰・費用が固定でかかる |

補足：

- **Google AI Pro の特典**：2026 年 1 月から、Google AI Pro に **月 $10 の Google Cloud クレジット**が付くようになった（Ultra は $100）。Google Developer Program の「My Benefits」から請求先アカウントを選んで適用すると、Firebase を含む Google Cloud の利用料に充てられる。
- **Firebase の注意点**：Cloud Storage for Firebase は Blaze（従量課金）プランが必須になった。ただし Blaze でも無料分（Firestore：保存 1 GiB・1 日 5 万回の読み取り・2 万回の書き込みなど）はそのまま使える。この規模なら無料分を超えにくく、超えても上記クレジットで相殺できる見込み。
- Supabase の Free プランは「1 週間アクセスがないと休止」するため、大会が月 1 回程度の運用には向かない。

## 4. 推奨：Firebase（Firestore + Cloud Storage + Firebase Auth）

理由：

1. **費用**：この規模ならほぼ無料分の範囲で、念のための超過分も AI Pro のクレジット（月 $10）で吸収できる。予算アラートで想定外の課金も防げる。
2. **サーバーのコードを書かずに済む**：ブラウザから直接読み書きし、権限は Security Rules で守る。今の「静的サイト」の構成（GitHub Pages）をほぼそのまま使える。
3. **Google アカウントでログイン**でき、運営メンバーの追加・削除も簡単。
4. 開発者に Firebase の経験がある。
5. リアルタイム同期（onSnapshot）があり、運営 2 人が同時に結果を入力しても画面が揃う。

採用しない理由：

- Supabase：機能は申し分ないが、休止しない Pro が月 $25 で、規模に対して割高。
- Cloudflare：無料枠は現実的だが、認証と API を自前で書く量が多く、Google の特典も使えない。
- スプレッドシート：手軽だが、同時編集・速度・画像配信が弱く、長く使うには不安。
- Cloud SQL：常時課金が発生し、この規模には過剰。

## 5. 設計方針

### 5.1 ログインと権限

- ログインは Google アカウント（Firebase Auth）。
- `members/{uid}` に役割を持たせる：`owner`（主催）／`staff`（運営：編集可）／`viewer`（閲覧のみ）。
- **決定**：当面は閲覧にログインを求めない（主催と開発者以外は画面共有越しに見る運用のため）。
- 書き込みは Firestore の `config/access.editors`（メールアドレスの配列）に載っている人だけに許可する。
  パスワードやアカウント DB は自前で持たず、Google ログイン（Firebase Auth）に任せる。
- 将来サーバー内の各自に編集させる場合は、閲覧も含めてログイン必須に切り替える（ルールの変更で対応できる）。

### 5.2 データモデル（Firestore）

```
members/{uid}          { role, displayName, email }
players/{playerId}     { name, discordName, xp, mains[], note, avatarPath, createdAt, updatedAt }
tournaments/{id}       { name, date, description, rules, status,
                         teams: [{ id, name, color, comment, pool[],
                                   members: [{ playerId, leader, featured, comment }] }],
                         bracket: { slots[], matches{} },
                         createdAt, updatedAt }
```

- **選手を大会から切り離す**のが今回の要点。チームは `playerId` を参照するだけにする。これでアイコン・XP・得意ブキの入力は 1 回で済む。
- チームと試合記録は大会のドキュメントにまとめて持つ（一度にまとめて更新でき、1 大会 〜50 KB なので上限 1 MB に対して余裕がある）。
- 選手アイコンは **選手ドキュメントの中に 192px に縮小した data URL のまま持つ**（1 枚 20KB 前後。上限 1MB に対して十分小さい）。
  - 当初は Cloud Storage に置く予定だったが、Storage の画像を表彰画像（Canvas）に描いて PNG に書き出すには
    バケットの CORS 設定が別途必要になる。data URL なら同一オリジン扱いでそのまま描けるため、こちらに変更した（2026-10-01）。
  - Firestore はブラウザに永続キャッシュするので、2 回目以降の読み込みでアイコンを毎回ダウンロードすることもない。

### 5.3 集計（直近の成績・よく使うブキ）

大会データを読み込み、ブラウザ側で計算する（今の `placements()` / `teamUses()` を流用）。

- 選手ごとの直近 N 大会の成績（優勝・準優勝・ベスト N）
- 選手ごとの使用ブキ回数・勝率（チームで統一したブキ × その選手が所属していた試合）

ゲームごとの出場メンバー（`lineupA` / `lineupB`）を記録する。補欠はほぼいない運用なので、
未指定（null）は「チーム全員」とみなし、規定人数より多いチームのときだけ入力欄を出す。

### 5.4 ブキアイコン

ブキアイコンは全員共通で変わらない画像なので、**DB に入れる必要はない**。
ブキデータと同じく生成スクリプトで `public/weapons/` に取り込み、静的ファイルとして配信する。

- 取得元：ブキデータと同じゲームデータ解析リポジトリ（`images/weapon_flat/`）
- **バックエンド移行を待たずに先行して入れられる。**

## 6. 移行計画（作業ブランチで段階的に進める）

| 段階 | 内容 | 本番（main）への影響 |
| --- | --- | --- |
| 0 | この ADR・X バッジの刷新 | なし |
| 1 | ブキアイコンの静的取り込みと表示（表彰画像・ブキ表） | 小（従来どおり動く） |
| 2 | **保存処理の抽象化**：今の `store.ts` を「保存先インターフェース」の裏に隠し、localStorage 版として実装し直す。あわせて選手を大会から切り離すデータ移行（JSON の自動変換）を入れる | 中（データ形式が変わる。自動変換とテストで担保） |
| 3 | Firebase 版の保存先を実装。Auth・Firestore・Storage・Security Rules を整え、エミュレーターでルールのテストを書く | なし（設定で切り替え） |
| 4 | 移行ツール：書き出した JSON を Firestore に取り込み、アイコンを Storage に移す | — |
| 5 | 選手ページ・集計画面（直近成績・よく使うブキ） | — |
| 6 | 本番切り替え。しばらくは JSON 書き出しを残し、戻せるようにする | 切り替え |

段階 2 までは今の構成のままで進められ、Firebase の準備を待たずに着手できる。

## 7. 決定事項（2026-10-01）

1. Firebase で進める。
2. Firebase のセットアップは開発者が行う（手順: [firebase-setup-manual.md](../firebase-setup-manual.md)。完了後に削除）。
3. 閲覧のログインは当面不要。書き込みのみ編集者リストで制限する。
4. ゲームごとの出場メンバーを記録する（補欠は基本いない）。
5. ブキアイコンの取り込み（段階 1）を進める。

## 8. 進み具合

- [x] 段階 0：ADR・X バッジ
- [x] 段階 1：ブキアイコン（`public/weapons/`、`npm run update-weapon-icons`）
- [x] 段階 2：保存処理の抽象化（`src/storage/`）・選手 DB 化・旧データの自動移行・出場メンバー記録・選手ページ
- [x] 段階 3：Firebase 版の保存先（`src/storage/firebase.ts`）・Google ログイン・編集者チェック・Security Rules とそのテスト（`npm run test:rules`）
- [x] 段階 4：移行ツール（設定ページの「このブラウザに保存されていたデータをオンラインに取り込む」、JSON 読み込み）
- [x] 段階 5：選手ページ・集計画面（段階 2 で実装済み）
- [x] 段階 6：本番切り替え（2026-10-01 にルール反映・マージ済み）

### 追記（2026-10-02）：データの完全統一

主催の要望により、端末ごとのデータ（localStorage のみのモード）・JSON での読み込み・旧データの取り込みを廃止し、
Firestore の 1 つのデータだけを全員で使う形にした。

- DB が空のときに各自の画面にだけ表示されていた仮の大会（「ブキ統一杯」）をやめ、「大会がまだありません」と作成ボタンを出す。
  これにより、運営メンバーが別々に同名の大会を作ってしまうことを防ぐ。
- 表示する大会の既定は一番新しい大会。選択は端末ごと（他人の画面は変えない）。
- バックアップ用の全データ書き出し（JSON）だけ残す。

### 追記（2026-10-05）：優勝賞品の動画

表彰ページに、主催が編集した優勝賞品の動画（1〜3 分、大きくても 1GB）を置き、ログインなしでダウンロードできるようにした。

- 置き場は Cloud Storage（作成済みの us-central1 のバケット）の `prize-videos/{大会ID}/`。Firestore のドキュメント上限（1MB）には入らないため。
- 一覧は Storage のファイル一覧とメタデータ（タイトル・アップロードした人）から作り、Firestore には何も書かない。
- 読み取りは誰でも、作成・削除は `config/access.editors` の人だけ（`storage.rules` から Firestore を参照する）。上書きは不可、動画のみ、2GB まで。
- ダウンロードは `Content-Disposition: attachment` を付けて保存するので、別オリジンでもリンクからそのまま保存できる（バケットの CORS 設定は不要）。
- 費用：無料分（保存 5GB・ダウンロード月 100GB）を超えた分が従量課金。1GB の動画が月 100 回ダウンロードされると超える規模なので、予算アラートで見ておく。

## 9. 参考

- Google AI Pro / Ultra への Google Developer Program 特典（Cloud クレジット）統合：https://blog.google/innovation-and-ai/technology/developers-tools/gdp-premium-ai-pro-ultra/
- クレジットの適用手順（My Benefits）：https://developers.google.com/program/my-benefits
- Cloud Storage for Firebase の Blaze 必須化：https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Supabase の料金と休止ポリシー：https://supabase.com/pricing
- Cloudflare Workers / D1 / R2 の無料枠：https://developers.cloudflare.com/d1/platform/pricing/
