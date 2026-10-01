import { useMemo, useState, type CSSProperties } from 'react';
import { Empty, FilterChip, Icon, Segmented, Switch, TeamName } from '../components/ui';
import { CATEGORIES, WEAPONS, getWeapon, matchesQuery, type Weapon } from '../data/weapons';
import type { MatchView } from '../lib/bracket';
import { teamUses } from '../lib/usage';
import type { Team, Tournament } from '../types';

type View = 'teams' | 'weapons' | 'table';
type CellState = 'pool' | 'used' | 'out' | 'offpool' | null;

const STATE_LABEL: Record<Exclude<CellState, null>, string> = {
  pool: '未使用',
  used: '使用',
  out: '使用済み',
  offpool: '候補外で使用',
};

const catColor = (w: Weapon) => CATEGORIES.find((c) => c.id === w.category)?.color;

/** どのチームがどのブキを持っていて、どれを使ったかを一覧する。画面共有で見やすいようカード表示が基本 */
export function WeaponsPage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const [view, setView] = useState<View>('teams');
  const [showAll, setShowAll] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // teamId -> weaponId -> 使用回数
  const usage = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const team of t.teams) {
      const c = new Map<string, number>();
      for (const u of teamUses(rounds, team.id)) c.set(u.weaponId, (c.get(u.weaponId) ?? 0) + 1);
      m.set(team.id, c);
    }
    return m;
  }, [t, rounds]);

  const stateOf = (team: Team, weaponId: string): { state: CellState; used: number } => {
    const inPool = team.pool.includes(weaponId);
    const used = usage.get(team.id)?.get(weaponId) ?? 0;
    if (inPool && used && t.rules.reuse === 'tournament') return { state: 'out', used };
    if (inPool && used) return { state: 'used', used };
    if (inPool) return { state: 'pool', used };
    if (used) return { state: 'offpool', used };
    return { state: null, used };
  };

  const rows = useMemo(() => {
    const relevant = (id: string) => t.teams.some((x) => x.pool.includes(id) || usage.get(x.id)?.has(id));
    return WEAPONS.filter(
      (w) => (showAll ? !w.replica || relevant(w.id) : relevant(w.id)) && (!cat || w.category === cat) && matchesQuery(w, query),
    )
      .map((w) => ({ w, count: t.teams.filter((x) => x.pool.includes(w.id)).length }))
      .sort((a, b) => b.count - a.count);
  }, [t, usage, showAll, cat, query]);

  const filters = (
    <>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input className="input" placeholder="ブキを検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Switch label="どのチームも登録していないブキも表示" checked={showAll} onChange={setShowAll} />
      </div>
      <div className="chips">
        <FilterChip label="すべて" selected={cat === null} onClick={() => setCat(null)} />
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.id}
            label={c.name}
            color={c.color}
            selected={cat === c.id}
            onClick={() => setCat(cat === c.id ? null : c.id)}
          />
        ))}
      </div>
    </>
  );

  return (
    <div className="page">
      <div className="page-header row">
        <h1 className="headline">ブキ表</h1>
        <span className="spacer" />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'teams', label: 'チーム別', icon: 'groups' },
            { value: 'weapons', label: 'ブキ別', icon: 'grid_view' },
            { value: 'table', label: '一覧表', icon: 'table_view' },
          ]}
        />
      </div>

      {t.teams.length === 0 ? (
        <Empty icon="groups">チームを登録するとここに表示されます</Empty>
      ) : view === 'teams' ? (
        <TeamsView t={t} usage={usage} stateOf={stateOf} />
      ) : (
        <>
          {filters}
          {rows.length === 0 ? (
            <Empty icon="table_view">表示するブキがありません（チームの候補ブキを登録してください）</Empty>
          ) : view === 'weapons' ? (
            <div className="grid weapon-grid">
              {rows.map(({ w, count }) => (
                <article
                  key={w.id}
                  className={`card weapon-card ${count >= 2 && !t.rules.allowDuplicate ? 'dup' : ''}`}
                  style={{ '--c': catColor(w) } as CSSProperties}
                >
                  <div className="weapon-card-head">
                    <span className="title-m">{w.name}</span>
                    <span className="count-badge">{count}</span>
                  </div>
                  <span className="picker-kit">
                    {w.sub} / {w.special}
                  </span>
                  <div className="team-chips">
                    {t.teams.map((team) => {
                      const { state, used } = stateOf(team, w.id);
                      if (!state) return null;
                      return (
                        <span key={team.id} className={`team-chip ${state}`} title={STATE_LABEL[state]}>
                          <TeamName name={team.name} color={team.color} />
                          {used > 0 && <small>{state === 'out' ? '使用済み' : `${used}回`}</small>}
                        </span>
                      );
                    })}
                    {count === 0 && <span className="muted body-s">登録チームなし</span>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <MatrixView t={t} rows={rows} stateOf={stateOf} />
          )}
        </>
      )}
      <p className="legend">
        <span className="cell-mark pool">◯</span>候補（未使用）
        <span className="cell-mark used">2</span>使用回数
        <span className="cell-mark out">✕</span>大会ルールにより使用済み
        <span className="cell-mark offpool">!</span>候補外のブキを使用
      </p>
    </div>
  );
}

function TeamsView(props: {
  t: Tournament;
  usage: Map<string, Map<string, number>>;
  stateOf: (team: Team, weaponId: string) => { state: CellState; used: number };
}) {
  const { t, usage, stateOf } = props;
  return (
    <div className="grid team-grid">
      {t.teams.map((team) => {
        const offPool = [...(usage.get(team.id)?.keys() ?? [])].filter((w) => !team.pool.includes(w));
        const available = team.pool.filter((w) => stateOf(team, w).state !== 'out').length;
        return (
          <article key={team.id} className="card pool-card" style={{ borderTopColor: team.color }}>
            <div className="team-card-head">
              <a href={`#/teams/${team.id}`} className="team-card-title">
                <TeamName name={team.name} color={team.color} big />
              </a>
              <span className="spacer" />
              <span className="count-badge" title="選べるブキ / 候補ブキ">
                {available}/{team.pool.length}
              </span>
            </div>
            <ul className="pool-list">
              {[...team.pool, ...offPool].map((id) => {
                const w = getWeapon(id);
                const { state, used } = stateOf(team, id);
                if (!w || !state) return null;
                return (
                  <li key={id} className={`pool-row ${state}`} style={{ '--c': catColor(w) } as CSSProperties}>
                    <span className="pool-row-name">
                      <b>{w.name}</b>
                      <span className="picker-kit">
                        {w.sub} / {w.special}
                      </span>
                    </span>
                    <span className={`status-pill ${state}`}>
                      {state === 'used' ? `${used}回使用` : STATE_LABEL[state]}
                    </span>
                  </li>
                );
              })}
              {team.pool.length === 0 && offPool.length === 0 && <li className="muted body-s">候補ブキ未登録</li>}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

function MatrixView(props: {
  t: Tournament;
  rows: { w: Weapon; count: number }[];
  stateOf: (team: Team, weaponId: string) => { state: CellState; used: number };
}) {
  const { t, rows, stateOf } = props;
  const mark = (state: CellState, used: number) =>
    state === 'out' ? '✕' : state === 'used' ? String(used) : state === 'pool' ? '◯' : state === 'offpool' ? '!' : '';
  return (
    <div className="table-wrap card">
      <table className="matrix">
        <thead>
          <tr>
            <th className="sticky-col">ブキ</th>
            <th>登録</th>
            {t.teams.map((team) => (
              <th key={team.id} className="team-col">
                <a href={`#/teams/${team.id}`}>
                  <TeamName name={team.name} color={team.color} />
                </a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ w, count }) => (
            <tr key={w.id} className={count >= 2 && !t.rules.allowDuplicate ? 'dup' : ''}>
              <th className="sticky-col weapon-cell" style={{ '--c': catColor(w) } as CSSProperties}>
                <span className="weapon-name">{w.name}</span>
                <span className="picker-kit">
                  {w.sub} / {w.special}
                </span>
              </th>
              <td className="count">{count || ''}</td>
              {t.teams.map((team) => {
                const { state, used } = stateOf(team, w.id);
                return (
                  <td key={team.id} className={`cell ${state ?? ''}`} title={state ? STATE_LABEL[state] : undefined}>
                    {mark(state, used)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
