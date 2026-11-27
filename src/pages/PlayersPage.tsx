import { useMemo, useState } from 'react';
import { PlayerProfileFields } from '../components/PlayerProfileFields';
import { TitleStars } from '../components/TitleStars';
import { Avatar, Empty, Icon, IconButton, Segmented, TeamName, WeaponIcon, XBadge } from '../components/ui';
import { normalizeForSearch, weaponName } from '../data/weapons';
import { bestPlacement, playerStats, winRate, type PlayerStats } from '../lib/stats';
import { manualTitleKey, playerTitles } from '../lib/titles';
import { navigate } from '../router';
import { newId, newPlayer, update, updatePlayer, useApp } from '../store';
import type { AppData, Player } from '../types';

type Sort = 'name' | 'xp' | 'entries' | 'winrate';

/** 勝率の表示 (「62%」。勝敗の記録がなければ「-」) */
const rateText = (s: { wins: number; decided: number }) => (s.decided ? `${Math.round((s.wins / s.decided) * 100)}%` : '-');

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
      if (sort === 'winrate') {
        // 勝敗の記録がない選手は最後。同じ勝率なら試合数の多い順
        const ra = winRate(a.stats) ?? -1;
        const rb = winRate(b.stats) ?? -1;
        return rb - ra || b.stats.decided - a.stats.decided;
      }
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
            { value: 'winrate', label: '勝率順' },
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
          <b>{stats.decided ? Math.round((stats.wins / stats.decided) * 100) : '-'}</b>
          {stats.decided ? '%' : ''} 勝率{stats.decided > 0 && <small className="muted">（{stats.decided}戦）</small>}
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
  const titles = useMemo(() => (p ? playerTitles(app, p) : null), [app, p]);
  if (!p || !stats || !titles) {
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
          <TitleStars gold={titles.gold} silver={titles.silver} />
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
          <TitlesCard player={p} titles={titles} />

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
                <b>{stats.decided ? Math.round((stats.wins / stats.decided) * 100) : '-'}</b>
                {stats.decided ? '%' : ''} 勝率
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">ブキ別の勝率（よく使う順）</h2>
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
                    <b className="weapon-usage-rate" title="勝敗を入力したゲームでの勝率">
                      {rateText(w)}
                    </b>
                    <span className="usage-bar" aria-hidden="true">
                      <span style={{ width: `${(w.games / stats.weapons[0].games) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">ルール別の勝率</h2>
            {stats.modes.length === 0 ? (
              <Empty>試合の記録がまだありません</Empty>
            ) : (
              <ul className="mode-stats">
                {stats.modes.map((m) => (
                  <li key={m.mode || 'none'}>
                    <span className="mode-stats-name">{m.mode || 'ルール未入力'}</span>
                    <span className="muted">
                      {m.games}試合 {m.wins}勝
                    </span>
                    <span className="usage-bar" aria-hidden="true">
                      <span style={{ width: `${(winRate(m) ?? 0) * 100}%` }} />
                    </span>
                    <b>{rateText(m)}</b>
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

/** 優勝・準優勝の戦績 (表彰画像の金星・銀星)。ツールの大会は自動、それ以外は手で登録する */
function TitlesCard({ player: p, titles }: { player: Player; titles: ReturnType<typeof playerTitles> }) {
  const [name, setName] = useState('');
  const [rank, setRank] = useState<1 | 2>(1);
  const [date, setDate] = useState('');
  const add = () => {
    if (!name.trim()) return;
    const id = newId();
    // 手で追加した戦績は、星にしたくて追加するものなので最初から星にする
    updatePlayer(p.id, (x) => {
      x.titles.push({ id, name: name.trim(), rank, date: date.trim() });
      x.starTitles.push(manualTitleKey(id));
    });
    setName('');
    setDate('');
  };
  const remove = (id: string) =>
    updatePlayer(p.id, (x) => {
      x.titles = x.titles.filter((t) => t.id !== id);
      x.starTitles = x.starTitles.filter((k) => k !== manualTitleKey(id));
    });
  const setStar = (key: string, on: boolean) =>
    updatePlayer(p.id, (x) => void (x.starTitles = on ? [...new Set([...x.starTitles, key])] : x.starTitles.filter((k) => k !== key)));
  return (
    <section className="card">
      <h2 className="card-title">
        優勝・準優勝
        <TitleStars gold={titles.gold} silver={titles.silver} />
      </h2>
      <p className="muted body-s">
        「星にする」にチェックした戦績が、表彰画像の金星（優勝）・銀星（準優勝）になります。このツールで記録した大会の優勝・準優勝は自動で一覧に出ます（星にするかは選んでください）。
        ツールを使う前の大会などは下で追加できます。
      </p>
      {titles.entries.length === 0 ? (
        <Empty>まだ優勝・準優勝の記録はありません</Empty>
      ) : (
        <ul className="list">
          {titles.entries.map((e) => (
            <li key={e.key} className={`list-row title-row ${e.starred ? '' : 'unstarred'}`}>
              <label className="title-star-toggle">
                <input type="checkbox" checked={e.starred} onChange={(ev) => setStar(e.key, ev.target.checked)} />
                <TitleStars gold={e.rank === 1 ? 1 : 0} silver={e.rank === 2 ? 1 : 0} />
                <span className="body-s">星にする</span>
              </label>
              <span className="title-row-name">
                {e.name}
                {e.date && <span className="muted body-s">（{e.date}）</span>}
              </span>
              <span className="spacer" />
              {e.source === 'auto' ? (
                <span className="badge">ツールの大会</span>
              ) : (
                <IconButton icon="delete" label="この記録を削除" onClick={() => remove(e.manualId!)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="title-add">
        <input className="input" placeholder="大会名（例: 第1回 BYリーグ）" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={rank} onChange={(e) => setRank(Number(e.target.value) === 2 ? 2 : 1)} aria-label="成績">
          <option value={1}>優勝</option>
          <option value={2}>準優勝</option>
        </select>
        <input className="input" placeholder="時期（任意）" value={date} maxLength={30} onChange={(e) => setDate(e.target.value)} />
        <button className="btn tonal" onClick={add} disabled={!name.trim()}>
          <Icon name="add" />
          追加
        </button>
      </div>
    </section>
  );
}

/** 選手を DB から削除し、どの大会のチームからも外す */
export function removePlayer(d: AppData, playerId: string) {
  d.players = d.players.filter((x) => x.id !== playerId);
  for (const t of d.tournaments) for (const team of t.teams) team.members = team.members.filter((m) => m.playerId !== playerId);
}
