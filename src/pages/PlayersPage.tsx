import { useMemo, useState } from 'react';
import { PlayerProfileFields } from '../components/PlayerProfileFields';
import { Avatar, Empty, Icon, IconButton, Segmented, TeamName, WeaponIcon, XBadge } from '../components/ui';
import { normalizeForSearch, weaponName } from '../data/weapons';
import { bestPlacement, playerStats, type PlayerStats } from '../lib/stats';
import { navigate } from '../router';
import { newPlayer, update, useApp } from '../store';
import type { AppData, Player } from '../types';

type Sort = 'name' | 'xp' | 'entries';

const PRIMARY = '#582eff';

export function PlayersPage({ playerId }: { playerId?: string }) {
  return playerId ? <PlayerDetail playerId={playerId} /> : <PlayerList />;
}

function PlayerList() {
  const app = useApp();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('name');

  const rows = useMemo(() => {
    const q = normalizeForSearch(query);
    const list = app.players
      .filter((p) => !q || normalizeForSearch(`${p.name} ${p.discord}`).includes(q))
      .map((p) => ({ p, stats: playerStats(app, p.id) }));
    list.sort((a, b) => {
      if (sort === 'xp') return (b.p.xp ?? 0) - (a.p.xp ?? 0);
      if (sort === 'entries') return b.stats.results.length - a.stats.results.length;
      return a.p.name.localeCompare(b.p.name, 'ja');
    });
    return list;
  }, [app, query, sort]);

  const add = () => {
    const p = newPlayer();
    update((d) => void d.players.push(p));
    navigate('players', p.id);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="headline">選手（{app.players.length}）</h1>
        <p className="muted">大会をまたいで使う選手 DB です。アイコン・Xパワー・得意ブキは一度登録すれば全大会で共通になります。</p>
      </div>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input className="input" placeholder="名前・Discord 名で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'name', label: '名前順' },
            { value: 'xp', label: 'XP順' },
            { value: 'entries', label: '出場数順' },
          ]}
        />
      </div>
      {app.players.length === 0 && <Empty icon="person_add">まだ選手がいません。右下の「選手を登録」か、チーム編集画面から登録できます。</Empty>}
      <div className="grid player-grid">
        {rows.map(({ p, stats }) => (
          <PlayerCard key={p.id} p={p} stats={stats} />
        ))}
      </div>
      <button className="fab" onClick={add}>
        <Icon name="person_add" />
        選手を登録
      </button>
    </div>
  );
}

function PlayerCard({ p, stats }: { p: Player; stats: PlayerStats }) {
  const best = bestPlacement(stats);
  const latest = stats.results[0];
  return (
    <a className="card player-db-card" href={`#/players/${p.id}`}>
      <div className="player-db-head">
        <Avatar name={p.name} src={p.avatar} color={latest?.teamColor ?? PRIMARY} size={56} />
        <div className="player-db-name">
          <span className="title-m">{p.name || '(名前未入力)'}</span>
          {p.discord && <span className="muted body-s">{p.discord}</span>}
          <XBadge xp={p.xp} withValue />
        </div>
      </div>
      <div className="player-db-stats">
        <span>
          <b>{stats.results.length}</b> 大会
        </span>
        <span>
          <b>{stats.games ? Math.round((stats.wins / stats.games) * 100) : '-'}</b>
          {stats.games ? '%' : ''} 勝率
        </span>
        {best && <span className="badge ok">最高 {best.label}</span>}
      </div>
      {stats.weapons.length > 0 && (
        <div className="top-weapons" title="よく使うブキ">
          {stats.weapons.slice(0, 4).map((w) => (
            <span key={w.weaponId} className="top-weapon" title={`${weaponName(w.weaponId)}：${w.games}試合`}>
              <WeaponIcon id={w.weaponId} size={36} />
              <small>×{w.games}</small>
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

function PlayerDetail({ playerId }: { playerId: string }) {
  const app = useApp();
  const p = app.players.find((x) => x.id === playerId);
  const stats = useMemo(() => (p ? playerStats(app, p.id) : null), [app, p]);
  if (!p || !stats) {
    return (
      <Empty icon="person">
        選手が見つかりません。<a href="#/players">選手一覧へ戻る</a>
      </Empty>
    );
  }
  const color = stats.results[0]?.teamColor ?? PRIMARY;

  const remove = () => {
    const entries = stats.results.map((r) => r.tournament.name);
    const msg = entries.length
      ? `${p.name || 'この選手'}を選手 DB から削除しますか？\n出場している大会（${entries.join('、')}）のチームからも外れます。`
      : `${p.name || 'この選手'}を選手 DB から削除しますか？`;
    if (!confirm(msg)) return;
    update((d) => removePlayer(d, p.id));
    navigate('players');
  };

  return (
    <div className="page">
      <div className="page-header row">
        <IconButton icon="arrow_back" label="選手一覧へ戻る" onClick={() => navigate('players')} />
        <h1 className="headline player-title">
          <Avatar name={p.name} src={p.avatar} color={color} size={44} />
          {p.name || '(名前未入力)'}
          <XBadge xp={p.xp} />
        </h1>
        <span className="spacer" />
        <button className="btn text danger" onClick={remove}>
          <Icon name="delete" />
          選手を削除
        </button>
      </div>

      <div className="detail-layout">
        <section className="card player-edit">
          <h2 className="card-title">プロフィール（全大会で共通）</h2>
          <PlayerProfileFields player={p} color={color} />
        </section>

        <div className="detail-side">
          <section className="card">
            <h2 className="card-title">戦績</h2>
            <div className="stats">
              <div className="stat">
                <b>{stats.results.length}</b>大会
              </div>
              <div className="stat">
                <b>{stats.games}</b>試合
              </div>
              <div className="stat">
                <b>{stats.games ? Math.round((stats.wins / stats.games) * 100) : '-'}</b>
                {stats.games ? '%' : ''} 勝率
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">よく使うブキ</h2>
            {stats.weapons.length === 0 ? (
              <Empty>試合の記録がまだありません</Empty>
            ) : (
              <ul className="weapon-usage">
                {stats.weapons.map((w) => (
                  <li key={w.weaponId}>
                    <WeaponIcon id={w.weaponId} size={44} />
                    <span className="weapon-usage-name">{weaponName(w.weaponId)}</span>
                    <span className="muted">
                      {w.games}試合 {w.wins}勝
                    </span>
                    <span className="usage-bar" aria-hidden="true">
                      <span style={{ width: `${(w.games / stats.weapons[0].games) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">大会成績（新しい順）</h2>
            {stats.results.length === 0 ? (
              <Empty>まだ大会に出場していません</Empty>
            ) : (
              <ul className="list">
                {stats.results.map((r) => (
                  <li key={r.tournament.id} className="list-row">
                    <span className="overline">
                      {r.tournament.name}
                      {r.tournament.date && `（${r.tournament.date}）`}
                    </span>
                    <TeamName name={r.teamName} color={r.teamColor} />
                    <span className="spacer" />
                    <span className={`badge ${r.placement?.rank === 1 ? 'ok' : ''}`}>{r.placement?.label ?? '結果未確定'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** 選手を DB から削除し、どの大会のチームからも外す */
export function removePlayer(d: AppData, playerId: string) {
  d.players = d.players.filter((x) => x.id !== playerId);
  for (const t of d.tournaments) for (const team of t.teams) team.members = team.members.filter((m) => m.playerId !== playerId);
}
