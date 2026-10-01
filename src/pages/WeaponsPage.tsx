import { useMemo, useState, type CSSProperties } from 'react';
import { Empty, TeamName } from '../components/ui';
import { CATEGORIES, WEAPONS, matchesQuery } from '../data/weapons';
import type { MatchView } from '../lib/bracket';
import { teamUses } from '../lib/usage';
import type { Tournament } from '../types';

type Sort = 'order' | 'popular';

/** ブキ × チームの一覧表。どのチームがどのブキを持っていて、どれを使ったかを一目で見る */
export function WeaponsPage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const [showAll, setShowAll] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('popular');

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

  const rows = useMemo(() => {
    const relevant = (id: string) => t.teams.some((x) => x.pool.includes(id) || usage.get(x.id)?.has(id));
    const list = WEAPONS.filter(
      (w) => (showAll ? !w.replica || relevant(w.id) : relevant(w.id)) && (!cat || w.category === cat) && matchesQuery(w, query),
    ).map((w) => ({ w, count: t.teams.filter((x) => x.pool.includes(w.id)).length }));
    if (sort === 'popular') list.sort((a, b) => b.count - a.count);
    return list;
  }, [t, usage, showAll, cat, query, sort]);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>ブキ表</h1>
      </div>
      <p className="muted">
        ◯ = 候補に登録 / 数字 = 使用回数 / ✕ = 大会ルールにより使用済みで選択不可 / ! = 候補外のブキを使用
      </p>
      <div className="picker-controls">
        <input className="input" placeholder="ブキを検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="popular">登録チーム数順</option>
          <option value="order">ブキ順</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          未登録のブキも表示
        </label>
      </div>
      <div className="chips">
        <button className={`chip ${cat === null ? 'on' : ''}`} onClick={() => setCat(null)}>
          すべて
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`chip ${cat === c.id ? 'on' : ''}`}
            style={{ '--c': c.color } as CSSProperties}
            onClick={() => setCat(cat === c.id ? null : c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {t.teams.length === 0 ? (
        <Empty>チームを登録するとここに一覧が表示されます</Empty>
      ) : rows.length === 0 ? (
        <Empty>表示するブキがありません（チームの候補ブキを登録してください）</Empty>
      ) : (
        <div className="table-wrap">
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
              {rows.map(({ w, count }) => {
                const color = CATEGORIES.find((c) => c.id === w.category)?.color;
                const dup = count >= 2 && !t.rules.allowDuplicate;
                return (
                  <tr key={w.id} className={dup ? 'dup' : ''}>
                    <th className="sticky-col weapon-cell" style={{ '--c': color } as CSSProperties}>
                      <span className="weapon-name">{w.name}</span>
                      <span className="picker-kit">
                        {w.sub} / {w.special}
                      </span>
                    </th>
                    <td className="count">{count || ''}</td>
                    {t.teams.map((team) => {
                      const inPool = team.pool.includes(w.id);
                      const used = usage.get(team.id)?.get(w.id) ?? 0;
                      let mark = '';
                      let cls = '';
                      if (inPool && used && t.rules.reuse === 'tournament') [mark, cls] = ['✕', 'out'];
                      else if (inPool && used) [mark, cls] = [String(used), 'used'];
                      else if (inPool) [mark, cls] = ['◯', 'pool'];
                      else if (used) [mark, cls] = ['!', 'warn'];
                      return (
                        <td key={team.id} className={`cell ${cls}`}>
                          {mark}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
