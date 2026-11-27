import { useMemo, useState } from 'react';
import { UsageTable } from '../components/UsageTable';
import { Empty, FilterChip, Segmented } from '../components/ui';
import { usageBy } from '../lib/records';
import { overallPicks } from '../lib/stats';
import { useApp } from '../store';
import type { GameMode } from '../types';

const MODES: GameMode[] = ['ナワバリ', 'エリア', 'ヤグラ', 'ホコ', 'アサリ'];

/**
 * 大会をまたいだ通算のブキ使用率・勝率。
 * 使用率は「記録された使用ブキ全体 (選手 × ゲーム) のうちの割合」。ブキ統一杯はチームのブキを出場メンバー全員の使用として数える
 */
export function OverallStatsPage() {
  const app = useApp();
  const all = useMemo(() => overallPicks(app), [app]);
  const [by, setBy] = useState<'weapon' | 'category'>('weapon');
  // ルールで絞り込む (空 = すべて)
  const [mode, setMode] = useState<GameMode | 'all'>('all');
  const picks = useMemo(() => (mode === 'all' ? all : all.filter((p) => p.mode === mode)), [all, mode]);
  const rows = useMemo(() => usageBy(picks, by), [picks, by]);
  const tournaments = new Set(picks.map((p) => p.tournamentId)).size;
  const games = new Set(picks.map((p) => `${p.tournamentId}:${p.matchKey}:${p.gameIndex}`)).size;

  return (
    <div className="page">
      <div className="page-header row">
        <h1 className="headline">通算記録</h1>
        <span className="spacer" />
        <Segmented
          value={by}
          onChange={setBy}
          options={[
            { value: 'weapon', label: 'ブキ別' },
            { value: 'category', label: 'カテゴリ別' },
          ]}
        />
      </div>
      <p className="muted">
        すべての大会の試合記録から、ブキの使用率と勝率を集計します（{tournaments} 大会・{games} ゲーム・のべ {picks.length} 人分）。
        ブキ統一杯はチームのブキを出場メンバー全員の使用として数えます。勝率は勝敗を入力したゲームだけで計算します。
      </p>
      <div className="chips">
        <FilterChip label="すべてのルール" selected={mode === 'all'} onClick={() => setMode('all')} />
        {MODES.map((m) => (
          <FilterChip key={m} label={m} selected={mode === m} onClick={() => setMode(m)} />
        ))}
      </div>
      {picks.length === 0 ? (
        <Empty icon="insights">
          {all.length === 0 ? 'まだ試合の記録がありません。試合記録で使用ブキを入力すると、ここに集計されます' : 'このルールの記録はまだありません（試合記録でルールを入力したゲームが対象です）'}
        </Empty>
      ) : (
        <section className="card">
          <h2 className="card-title">{by === 'weapon' ? 'ブキ' : 'カテゴリ'}別の使用率・勝率</h2>
          <UsageTable rows={rows} by={by} total={picks.length} />
        </section>
      )}
    </div>
  );
}
