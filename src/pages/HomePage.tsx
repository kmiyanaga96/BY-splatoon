import { WeaponTag, TeamName, Empty } from '../components/ui';
import { champion, isPlayable, roundName, sideId, type MatchView } from '../lib/bracket';
import { rulesText } from '../lib/announce';
import { navigate } from '../router';
import type { Tournament } from '../types';

export function HomePage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const team = (id: string | null) => t.teams.find((x) => x.id === id);
  const playable = rounds.flat().filter(isPlayable);
  const done = playable.filter((m) => m.winner.kind === 'team');
  const upcoming = playable.filter((m) => m.a.kind === 'team' && m.b.kind === 'team' && m.winner.kind === 'tbd');
  const champ = team(champion(rounds));
  const featured = t.teams.flatMap((tm) => tm.players.filter((p) => p.featured).map((p) => ({ p, tm })));

  const steps = [
    { done: t.name !== '新しい大会' && t.name !== 'ブキ統一杯', label: '大会名・ルールを設定する', to: 'settings' },
    { done: t.teams.length >= 2, label: 'チームとメンバー・候補ブキを登録する', to: 'teams' },
    { done: t.bracket.slots.length > 0, label: 'トーナメント表を作成する', to: 'bracket' },
    { done: done.length > 0, label: '試合結果とブキを記録し、告知文をコピーする', to: 'announce' },
  ];

  return (
    <div className="stack">
      <section className="hero">
        <h1>{t.name}</h1>
        {t.date && <p className="hero-date">📅 {t.date}</p>}
        {t.description && <p className="pre">{t.description}</p>}
        {champ && (
          <p className="champion">
            🏆 優勝 <TeamName name={champ.name} color={champ.color} big />
          </p>
        )}
        <div className="stats">
          <div className="stat">
            <b>{t.teams.length}</b>チーム
          </div>
          <div className="stat">
            <b>{t.teams.reduce((n, x) => n + x.players.length, 0)}</b>選手
          </div>
          <div className="stat">
            <b>
              {done.length}/{playable.length}
            </b>
            試合終了
          </div>
        </div>
      </section>

      {steps.some((s) => !s.done) && (
        <section className="card">
          <h2>はじめかた</h2>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? 'done' : ''}>
                <a href={`#/${s.to}`}>{s.label}</a>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <h2>次の試合</h2>
        {upcoming.length === 0 ? (
          <Empty>対戦カードが確定している未消化の試合はありません</Empty>
        ) : (
          <ul className="list">
            {upcoming.map((m) => {
              const a = team(sideId(m.a))!;
              const b = team(sideId(m.b))!;
              return (
                <li key={m.key} className="list-row clickable" onClick={() => navigate('bracket', m.key)}>
                  <span className="muted">
                    {roundName(m.round, rounds.length)} #{m.index + 1}
                  </span>
                  <TeamName name={a.name} color={a.color} />
                  <span className="vs">
                    {m.winsA} - {m.winsB}
                  </span>
                  <TeamName name={b.name} color={b.color} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>注目選手</h2>
        {featured.length === 0 ? (
          <Empty>チーム編集画面で「注目」にチェックを入れた選手がここに表示されます</Empty>
        ) : (
          <div className="grid">
            {featured.map(({ p, tm }) => (
              <a key={p.id} className="player-card" href={`#/teams/${tm.id}`} style={{ borderColor: tm.color }}>
                <div className="player-card-head">
                  <b>⭐ {p.name || '(名前未入力)'}</b>
                  <TeamName name={tm.name} color={tm.color} />
                </div>
                {p.rank && <div className="muted">{p.rank}</div>}
                <div className="tags">
                  {p.mains.map((w) => (
                    <WeaponTag key={w} id={w} />
                  ))}
                </div>
                {p.comment && <p className="pre small">{p.comment}</p>}
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>ルール</h2>
        <p className="pre">{rulesText(t)}</p>
      </section>
    </div>
  );
}
