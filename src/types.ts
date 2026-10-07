// アプリ全体のデータ型。保存先 (Firestore) とバックアップの JSON はこの形を扱う。

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
  /** ランダムブキで「大会で 1 回」抽選したときの結果 (Player.id -> Weapon.id) */
  draws: Record<string, string>;
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
  /** 選手ごとの使用ブキ (Player.id -> Weapon.id)。通常ルールの大会で使う。未入力は null */
  picksA: Record<string, string> | null;
  picksB: Record<string, string> | null;
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
 * - category: カテゴリ縛り (運営が指定したカテゴリのブキだけ)
 * - random: ランダムブキ (アプリで選手ごとに抽選)
 */
export type TournamentKind = 'unified' | 'free' | 'category' | 'random';

/** ランダムブキの抽選のタイミング */
export type RandomTiming = 'game' | 'match' | 'tournament';

/** 大会のロゴ: BYリーグ (競技) / BYリーグ InkParty (エンジョイ、配色 2 種) */
export type Brand = 'league' | 'inkparty-yellow' | 'inkparty-pink';

export interface Rules {
  kind: TournamentKind;
  /** 大会のロゴ (表彰画像・ホームに表示) */
  brand: Brand;
  /** カテゴリ縛りで使えるカテゴリ (CATEGORIES の id)。kind: category でだけ使う */
  categories: string[];
  /** ランダムブキの抽選のタイミング。kind: random でだけ使う */
  randomTiming: RandomTiming;
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

/** 予選リーグの順位の決め方 (上から順に比べる) */
export type Tiebreaker = 'wins' | 'gamesWon' | 'gamesLost' | 'gameDiff' | 'headToHead' | 'entry';

export interface LeagueGroup {
  id: string;
  name: string;
  teamIds: string[];
}

/** 予選リーグ (グループごとの総当たり)。上位が本選トーナメントに進む */
export interface League {
  groups: LeagueGroup[];
  /** 各グループから本選に進むチーム数 */
  advance: number;
  bestOf: number;
  tiebreakers: Tiebreaker[];
  /** key: "L:<グループID>:<チームID>:<チームID>" */
  matches: Record<string, MatchRecord>;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  description: string;
  rules: Rules;
  teams: Team[];
  /** 予選リーグ。予選なしは null */
  league: League | null;
  /** 本選トーナメント */
  bracket: Bracket;
}

export type PlayerMap = Map<string, Player>;

export interface AppData {
  version: 2;
  currentId: string;
  players: Player[];
  tournaments: Tournament[];
}
