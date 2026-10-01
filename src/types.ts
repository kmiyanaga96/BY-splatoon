// アプリ全体のデータ型。localStorage と JSON エクスポートはこの形で保存される。

export interface Player {
  id: string;
  name: string;
  /** 得意ブキ (Weapon.id) */
  mains: string[];
  /** ウデマエなど自由記述のメモ */
  rank: string;
  /** Xパワー (バッジ表示に使う)。未入力は null */
  xp: number | null;
  /** アイコン画像 (縮小済みの data URL)。未設定は空文字 */
  avatar: string;
  comment: string;
  /** 注目選手 */
  featured: boolean;
  leader: boolean;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  /** 意気込み・チーム紹介 */
  comment: string;
  players: Player[];
  /** 登録した候補ブキ (Weapon.id) */
  pool: string[];
}

export type GameMode = '' | 'ナワバリ' | 'エリア' | 'ヤグラ' | 'ホコ' | 'アサリ';

export interface Game {
  weaponA: string;
  weaponB: string;
  mode: GameMode;
  stage: string;
  winner: 'A' | 'B' | null;
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

export interface Rules {
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

export interface AppData {
  version: 1;
  currentId: string;
  tournaments: Tournament[];
}
