// アプリ全体のデータ型。保存先 (localStorage / Firebase) と JSON エクスポートはこの形を扱う。

/** 選手 DB の 1 人。大会をまたいで共通 (アイコンや XP は一度登録すれば使い回せる) */
export interface Player {
  id: string;
  name: string;
  /** Discord の表示名など (任意) */
  discord: string;
  /** Xパワー (バッジ表示に使う)。未入力は null */
  xp: number | null;
  /** アイコン画像 (縮小済みの data URL / 保存先の URL)。未設定は空文字 */
  avatar: string;
  /** 得意ブキ (Weapon.id) */
  mains: string[];
  /** ウデマエなど自由記述のメモ */
  note: string;
}

/** チームへの所属。大会ごとの情報 (リーダー・注目選手・紹介文) はこちらに持つ */
export interface Member {
  playerId: string;
  leader: boolean;
  /** 注目選手 */
  featured: boolean;
  /** 注目ポイント・ひとこと */
  comment: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  /** 意気込み・チーム紹介 */
  comment: string;
  members: Member[];
  /** 登録した候補 (rules.poolUnit が weapon なら Weapon.id、main ならメイン ID) */
  pool: string[];
}

export type GameMode = '' | 'ナワバリ' | 'エリア' | 'ヤグラ' | 'ホコ' | 'アサリ';

export interface Game {
  weaponA: string;
  weaponB: string;
  mode: GameMode;
  stage: string;
  winner: 'A' | 'B' | null;
  /** そのゲームに出た選手 (Player.id)。null はチーム全員 (補欠がいないとき) */
  lineupA: string[] | null;
  lineupB: string[] | null;
}

/** トーナメントの 1 試合の記録 */
export interface MatchRecord {
  /** 記録した時点の対戦カード。現在のカードと一致しない記録は無効として扱う */
  a: string;
  b: string;
  games: Game[];
  /** 不戦勝などで勝者を直接指定したいとき (Team.id) */
  override: string | null;
  note: string;
}

export interface Bracket {
  /** 1 回戦の枠 (長さは 2 の累乗)。null は不戦勝枠 */
  slots: (string | null)[];
  /** key: "ラウンド-番号" (例: "0-3") */
  matches: Record<string, MatchRecord>;
}

/**
 * 同じチームが同じブキを再度使えるか
 * - free: 制限なし
 * - match: 同じ試合(セット)内では再使用不可
 * - tournament: 大会を通して再使用不可
 */
export type ReuseRule = 'free' | 'match' | 'tournament';

/**
 * 候補の単位
 * - weapon: ブキ 1 つずつ (ボールドマーカーとボールドマーカーネオは別)
 * - main: メイン単位 (マイナーチェンジも同じメインとして使える)。Team.pool にはメイン ID が入る
 */
export type PoolUnit = 'weapon' | 'main';

/**
 * 大会の種類 (ADR 0002)。種類ごとの違いは src/lib/kinds.ts にまとめる
 * - unified: ブキ統一杯 (候補ブキを事前登録)
 * - free: 通常ルール (ブキ自由)
 */
export type TournamentKind = 'unified' | 'free';

export interface Rules {
  kind: TournamentKind;
  /** 以下 poolUnit〜allowDuplicate はブキ統一杯 (kind: unified) でだけ使う */
  poolUnit: PoolUnit;
  /** 候補ブキの登録上限 (0 で無制限) */
  poolMax: number;
  reuse: ReuseRule;
  /** 他チームと同じ候補ブキを登録してよいか */
  allowDuplicate: boolean;
  bestOf: number;
  finalBestOf: number;
  teamSize: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  description: string;
  rules: Rules;
  teams: Team[];
  bracket: Bracket;
}

export type PlayerMap = Map<string, Player>;

export interface AppData {
  version: 2;
  currentId: string;
  players: Player[];
  tournaments: Tournament[];
}
