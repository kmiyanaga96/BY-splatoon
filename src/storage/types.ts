import type { AppData, Player, Tournament } from '../types';

/** 前回の保存から変わった選手・大会 (Firebase などドキュメント単位で保存する先のため) */
export interface Changes {
  players: { upserted: Player[]; deleted: string[] };
  tournaments: { upserted: Tournament[]; deleted: string[] };
}

/**
 * データの保存先。いまは localStorage 版のみ。Firebase 版も同じ形で実装して差し替える。
 * 受け取ったデータは必ず normalizeData() を通してから使う (保存先のデータは信用しない)。
 */
export interface StorageAdapter {
  readonly name: string;
  /** 起動時の読み込み。データがなければ null */
  load(): Promise<unknown | null>;
  /** 変更を保存する。data は変更後の全体、changes はその差分 */
  save(data: AppData, changes: Changes): Promise<void>;
  /** 別のタブ・端末での変更を受け取る (対応していなければ省略) */
  subscribe?(onRemoteChange: (raw: unknown) => void): () => void;
}
