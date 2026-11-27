// 対抗戦の詳細マッチアップ分析 (LLM) の下準備。今回は呼び出し口だけで、画面にはまだ出さない。
//
// 静的サイト (GitHub Pages) には API キーを置けないので、実装するときはサーバー側 (Cloud Functions など) で
// LLM を呼び出し、ここの MatchupAnalyzer をそのサーバーを呼ぶ実装に差し替える。
// 運営 (編集者) だけが明示的にボタンを押したときに実行する (常時の自動実行はしない)。
import { getWeapon } from '../data/weapons';
import type { CheckerRule } from './checker';
import { weaponTactics, type WeaponTactics } from './tactics';

export interface MatchupInput {
  rule: CheckerRule;
  /** 味方 4 人のブキ ID */
  allies: string[];
  /** 相手 4 人のブキ ID */
  enemies: string[];
}

export interface MatchupWeapon extends WeaponTactics {
  name: string;
}

/** LLM に渡す材料 (ブキ名と戦術データ) */
export interface MatchupContext {
  rule: CheckerRule;
  allies: MatchupWeapon[];
  enemies: MatchupWeapon[];
}

export function buildMatchupContext(input: MatchupInput): MatchupContext {
  const conv = (ids: string[]) => ids.map((id) => ({ ...weaponTactics(id), name: getWeapon(id)?.name ?? id }));
  return { rule: input.rule, allies: conv(input.allies), enemies: conv(input.enemies) };
}

/** LLM への指示文 (サーバー側でそのまま使える形) */
export function matchupPrompt(ctx: MatchupContext): string {
  const row = (w: MatchupWeapon) =>
    `- ${w.name}: ポジション ${w.role ?? '?'} / 有効射程 ${w.range ?? '?'} / 塗り拡張 ${w.paintArea ?? '?'} / 瞬間塗り ${w.paintBurst ?? '?'} / キル ${w.kill ?? '?'} / 打開力 ${w.entry ?? '?'} / スペシャル分類 ${w.specialCategories.join('・') || '?'}`;
  return [
    `スプラトゥーン3 の ${ctx.rule} の対抗戦です。味方と相手の編成から、試合前に共有する立ち回りの指針を日本語で 5 行以内にまとめてください。`,
    '「誰が誰を見るか（マッチアップ）」と、ルール上の勝ち筋・注意点を具体的に書いてください。評価は 1〜5、射程は試し撃ちのライン本数です。',
    '',
    '味方:',
    ...ctx.allies.map(row),
    '',
    '相手:',
    ...ctx.enemies.map(row),
  ].join('\n');
}

export interface MatchupAnalyzer {
  analyze(ctx: MatchupContext): Promise<string>;
}

/** 分析の実装。未設定 (null) のあいだは画面に分析ボタンを出さない */
export let matchupAnalyzer: MatchupAnalyzer | null = null;

export function setMatchupAnalyzer(a: MatchupAnalyzer | null) {
  matchupAnalyzer = a;
}
