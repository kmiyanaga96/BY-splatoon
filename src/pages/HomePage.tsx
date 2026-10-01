import { Avatar, Empty, Icon, TeamName, WeaponTag, XBadge } from '../components/ui';
import { rulesText } from '../lib/announce';
import { champion, isPlayable, roundName, sideId, type MatchView } from '../lib/bracket';
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
    <div className="page">
      <section className="hero card">
        <h1 className="display">{t.name}</h1>
        {t.date && <p className="hero-date">{t.date}</p>}
        {t.description && <p className="pre body-l">{t.description}</p>}
        {champ && (
          <p className="champion">
            <Icon name="emoji_events" filled /> 優勝 <TeamName name={champ.name} color={champ.color} big />
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
          <h2 className="card-title">はじめかた</h2>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s.label} className={s.done ? 'done' : ''}>
                <a href={`#/${s.to}`} className="step">
                  <span className="step-no">{s.done ? <Icon name="check" /> : i + 1}</span>
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="cols-2">
        <section className="card">
          <h2 className="card-title">次の試合</h2>
          {upcoming.length === 0 ? (
            <Empty icon="account_tree">対戦カードが確定している未消化の試合はありません</Empty>
          ) : (
            <ul className="list">
              {upcoming.map((m) => {
                const a = team(sideId(m.a))!;
                const b = team(sideId(m.b))!;
                return (
                  <li key={m.key}>
                    <button className="list-item" onClick={() => navigate('bracket', m.key)}>
                      <span className="overline">
                        {roundName(m.round, rounds.length)} #{m.index + 1}
                      </span>
                      <span className="match-line">
                        <TeamName name={a.name} color={a.color} />
                        <span className="vs">
                          {m.winsA} - {m.winsB}
                        </span>
                        <TeamName name={b.name} color={b.color} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">ルール</h2>
          <p className="pre">{rulesText(t)}</p>
        </section>
      </div>

      <section>
        <h2 className="section-title">注目選手</h2>
        {featured.length === 0 ? (
          <Empty icon="star">チーム編集画面で「注目」をオンにした選手がここに表示されます</Empty>
        ) : (
          <div className="grid">
            {featured.map(({ p, tm }) => (
              <a key={p.id} className="card player-card" href={`#/teams/${tm.id}`} style={{ borderLeftColor: tm.color }}>
                <div className="player-card-head">
                  <span className="title-m player-title">
                    <Avatar name={p.name} src={p.avatar} color={tm.color} size={36} />
                    {p.name || '(名前未入力)'}
                    <XBadge xp={p.xp} />
                  </span>
                  <TeamName name={tm.name} color={tm.color} />
                </div>
                {(p.xp || p.rank) && (
                  <div className="muted">
                    {p.xp ? `XP${p.xp}` : ''} {p.rank}
                  </div>
                )}
                <div className="tags">
                  {p.mains.map((w) => (
                    <WeaponTag key={w} id={w} />
                  ))}
                </div>
                {p.comment && <p className="pre body-s">{p.comment}</p>}
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
