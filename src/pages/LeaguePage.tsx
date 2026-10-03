import { useState } from 'react';
import { Empty, Field, Icon, TeamName } from '../components/ui';
import { createSlots, type MatchView } from '../lib/bracket';
import { TIEBREAKER_LABEL, computeLeague, seedsFromLeague, tieAtCutoff, type GroupView } from '../lib/league';
import { makeGroups } from '../model';
import { navigate, useRoute } from '../router';
import { updateCurrent } from '../store';
import type { Tournament } from '../types';
import { MatchEditor } from './MatchEditor';

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 予選リーグの順位から本選トーナメントの 1 回戦の枠を作る */
export function createBracketFromLeague(t: Tournament): boolean {
  const league = t.league;
  if (!league) return false;
  const groups = computeLeague(t);
  const notes = [
    groups.some((g) => !g.complete) && '予選リーグにまだ終わっていない試合があります。',
    groups.some((g) => g.complete && tieAtCutoff(g, league.advance)) && '進出ラインで同順位のグループがあります（作成後に枠を手で直せます）。',
    t.bracket.slots.length && `今の本選トーナメントを作り直します${Object.keys(t.bracket.matches).length ? '（記録済みの試合結果は消えます）' : ''}。`,
  ].filter(Boolean);
  if (!confirm([`予選の順位から本選トーナメント（各グループ上位 ${league.advance} チーム）を作成しますか？`, ...notes].join('\n'))) return false;
  const seeds = seedsFromLeague(groups, league.advance);
  updateCurrent((d) => {
    d.bracket = { slots: createSlots(seeds), matches: {} };
  });
  return true;
}

export function LeaguePage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const [, openKey] = useRoute();
  const [editing, setEditing] = useState(false);
  const league = t.league;
  if (!league) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="headline">予選リーグ</h1>
        </div>
        <Empty icon="leaderboard">
          この大会には予選リーグがありません。<a href="#/settings">設定</a>の「予選リーグ」から追加できます。
        </Empty>
      </div>
    );
  }
  const groups = computeLeague(t);
  const open = groups.flatMap((g) => g.matches).find((m) => m.key === openKey);
  const grouped = new Set(league.groups.flatMap((g) => g.teamIds));
  const ungrouped = t.teams.filter((x) => !grouped.has(x.id));
  const complete = groups.length > 0 && groups.every((g) => g.complete);

  return (
    <div className="page">
      <div className="page-header row">
        <h1 className="headline">予選リーグ</h1>
        <span className="spacer" />
        <button className={`btn ${editing ? 'filled' : 'tonal'}`} onClick={() => setEditing(!editing)}>
          <Icon name={editing ? 'check' : 'edit'} />
          {editing ? 'グループ分けの編集を終える' : 'グループ分けを編集'}
        </button>
      </div>
      <p className="muted">
        各グループで総当たり（BO{league.bestOf}）。上位 {league.advance} チームが本選トーナメントへ進みます。順位の決め方:{' '}
        {league.tiebreakers.map((k) => TIEBREAKER_LABEL[k]).join(' → ')}（<a href="#/settings">設定で変更</a>）
      </p>

      {ungrouped.length > 0 && (
        <div className="banner warn">
          <Icon name="warning" />
          グループに入っていないチームがあります: {ungrouped.map((x) => x.name).join('、')}。グループ分けを編集してください。
        </div>
      )}
      {editing && <GroupEditor t={t} />}

      {groups.length === 0 || groups.every((g) => g.group.teamIds.length === 0) ? (
        <Empty icon="groups">チームを登録してから、グループ分けを作ってください</Empty>
      ) : (
        <div className="grid league-grid">
          {groups.map((g) => (
            <GroupCard key={g.group.id} t={t} g={g} advance={league.advance} />
          ))}
        </div>
      )}

      <section className="card">
        <h2 className="card-title">本選トーナメント</h2>
        <p className="muted body-s">
          予選の順位から、別グループの 1 位と 2 位が当たるように 1 回戦の枠を作ります（たすき掛け）。作成後に枠を手で直すこともできます。
          ブキの使用制限は予選と本選を通算します。
        </p>
        <div className="card-actions">
          <button
            className={`btn ${complete ? 'filled' : 'outlined'}`}
            onClick={() => createBracketFromLeague(t) && navigate('bracket')}
          >
            <Icon name="account_tree" />
            予選の順位から本選トーナメントを作成
          </button>
        </div>
      </section>

      {open && <MatchEditor t={t} rounds={rounds} m={open} onClose={() => navigate('league')} />}
    </div>
  );
}

function GroupCard({ t, g, advance }: { t: Tournament; g: GroupView; advance: number }) {
  const team = (id: string | null) => t.teams.find((x) => x.id === id);
  return (
    <section className="card">
      <h2 className="card-title">
        {g.group.name}
        {g.complete && <span className="badge ok">確定</span>}
      </h2>
      <div className="table-wrap">
        <table className="usage-table standings">
          <thead>
            <tr>
              <th className="num">順位</th>
              <th>チーム</th>
              <th className="num">勝</th>
              <th className="num">敗</th>
              <th className="num">ゲーム</th>
              <th className="num">得失</th>
            </tr>
          </thead>
          <tbody>
            {g.standings.map((r, i) => {
              const x = team(r.teamId);
              const diff = r.gamesWon - r.gamesLost;
              return (
                <tr key={r.teamId} className={i < advance ? 'advance' : ''}>
                  <td className="num">{r.rank}</td>
                  <th>{x && <TeamName name={x.name} color={x.color} />}</th>
                  <td className="num">{r.wins}</td>
                  <td className="num">{r.losses}</td>
                  <td className="num">
                    {r.gamesWon}-{r.gamesLost}
                  </td>
                  <td className="num">{diff > 0 ? `+${diff}` : diff}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {tieAtCutoff(g, advance) && (
        <p className="supporting warn-text">
          <Icon name="warning" /> 進出ラインで同順位です。本選の枠は作成後に手で直してください。
        </p>
      )}
      {g.rounds.map((round, r) => (
        <div key={r} className="league-round">
          <span className="overline">第{r + 1}節</span>
          <ul className="list">
            {round.map((m) => {
              const a = team(m.a.kind === 'team' ? m.a.id : null);
              const b = team(m.b.kind === 'team' ? m.b.id : null);
              const winner = m.winner.kind === 'team' ? m.winner.id : null;
              return (
                <li key={m.key}>
                  <button className={`list-item ${winner ? 'done' : ''}`} onClick={() => navigate('league', m.key)}>
                    <span className="match-line">
                      {a && <TeamName name={a.name} color={a.color} />}
                      <span className="vs">{m.record?.override ? '不戦勝' : `${m.winsA} - ${m.winsB}`}</span>
                      {b && <TeamName name={b.name} color={b.color} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** グループの数・振り分けの編集 */
function GroupEditor({ t }: { t: Tournament }) {
  const league = t.league!;
  const [count, setCount] = useState(Math.max(1, league.groups.length));
  const hasRecords = Object.keys(league.matches).length > 0;
  const regroup = (random: boolean) => {
    if (hasRecords && !confirm('グループ分けを作り直しますか？\n対戦カードが変わった試合の記録は無効になります。')) return;
    const ids = t.teams.map((x) => x.id);
    updateCurrent((d) => {
      if (d.league) d.league.groups = makeGroups(random ? shuffle(ids) : ids, count);
    });
  };
  const move = (teamId: string, groupId: string) =>
    updateCurrent((d) => {
      if (!d.league) return;
      for (const g of d.league.groups) g.teamIds = g.teamIds.filter((x) => x !== teamId);
      d.league.groups.find((g) => g.id === groupId)?.teamIds.push(teamId);
    });
  const groupOf = (teamId: string) => league.groups.find((g) => g.teamIds.includes(teamId))?.id ?? '';
  return (
    <section className="card">
      <h2 className="card-title">グループ分け</h2>
      <div className="form-row">
        <Field label="グループの数">
          <input
            className="input"
            type="number"
            min={1}
            max={Math.max(1, t.teams.length)}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      </div>
      <div className="card-actions">
        <button className="btn outlined" onClick={() => regroup(true)}>
          <Icon name="shuffle" />
          ランダムに振り分け
        </button>
        <button className="btn filled" onClick={() => regroup(false)}>
          <Icon name="groups" />
          チーム一覧の順（シード順）で振り分け
        </button>
      </div>
      <p className="muted body-s">
        シード順ではジグザグに配るので、上位チームが同じグループに偏りません。下の一覧で 1 チームずつ移動もできます。
      </p>
      <div className="slot-grid">
        {t.teams.map((x) => (
          <label key={x.id} className="slot-pair">
            <TeamName name={x.name} color={x.color} />
            <select className="input" value={groupOf(x.id)} onChange={(e) => move(x.id, e.target.value)}>
              <option value="">（未所属）</option>
              {league.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}
