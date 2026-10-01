import { useState } from 'react';
import { Empty, TeamName } from '../components/ui';
import {
  bracketSizeFor,
  champion,
  createSlots,
  isPlayable,
  roundName,
  sideId,
  type MatchView,
  type Side,
} from '../lib/bracket';
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

export function BracketPage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const [, openKey] = useRoute();
  const [editingSlots, setEditingSlots] = useState(false);
  const open = rounds.flat().find((m) => m.key === openKey);
  const champ = t.teams.find((x) => x.id === champion(rounds));
  const stale = rounds.flat().filter((m) => m.stale);
  const placed = new Set(t.bracket.slots.filter(Boolean));
  const unplaced = t.teams.filter((x) => !placed.has(x.id));

  const generate = (random: boolean) => {
    const hasRecords = Object.keys(t.bracket.matches).length > 0;
    if (t.bracket.slots.length && !confirm(`トーナメント表を作り直しますか？${hasRecords ? '\n記録済みの試合結果はすべて消えます。' : ''}`))
      return;
    const ids = t.teams.map((x) => x.id);
    updateCurrent((d) => {
      d.bracket = { slots: createSlots(random ? shuffle(ids) : ids), matches: {} };
    });
  };

  const clearStale = () =>
    updateCurrent((d) => {
      for (const m of stale) delete d.bracket.matches[m.key];
    });

  if (t.bracket.slots.length === 0) {
    return (
      <div className="stack">
        <h1>トーナメント</h1>
        <section className="card">
          <p>
            登録済みの {t.teams.length} チームから {bracketSizeFor(t.teams.length)} 枠のシングルエリミネーション表を作ります。
            不足分は上位シードの不戦勝になります。
          </p>
          {t.teams.length < 2 ? (
            <Empty>
              2 チーム以上登録すると作成できます。<a href="#/teams">チームを登録する</a>
            </Empty>
          ) : (
            <div className="row">
              <button className="btn primary" onClick={() => generate(false)}>
                チーム一覧の順（シード順）で作成
              </button>
              <button className="btn" onClick={() => generate(true)}>
                ランダムに組み合わせて作成
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>トーナメント</h1>
        <span className="spacer" />
        <button className={`btn ${editingSlots ? 'primary' : ''}`} onClick={() => setEditingSlots(!editingSlots)}>
          {editingSlots ? '枠の編集を終える' : '1回戦の枠を編集'}
        </button>
        <button className="btn" onClick={() => generate(false)}>
          シード順で作り直す
        </button>
        <button className="btn" onClick={() => generate(true)}>
          ランダムで作り直す
        </button>
      </div>

      {champ && (
        <div className="champion-banner" style={{ borderColor: champ.color }}>
          🏆 優勝 <TeamName name={champ.name} color={champ.color} big />
        </div>
      )}
      {unplaced.length > 0 && (
        <div className="banner warn">
          トーナメント表に入っていないチームがあります: {unplaced.map((x) => x.name).join('、')}。
          枠を編集するか作り直してください。
        </div>
      )}
      {stale.length > 0 && (
        <div className="banner warn">
          前の試合の結果が変わったため、{stale.length} 試合の記録が無効になっています。
          <button className="btn small" onClick={clearStale}>
            無効な記録を削除
          </button>
        </div>
      )}

      {editingSlots && <SlotEditor t={t} />}

      <div className="bracket-wrap">
        <div className="bracket">
          {rounds.map((round, r) => (
            <div key={r} className="round">
              <div className="round-title">{roundName(r, rounds.length)}</div>
              <div className="round-matches">
                {round.map((m) => (
                  <MatchCard key={m.key} t={t} m={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="muted small">試合をクリックするとゲーム結果・使用ブキを記録できます。</p>

      {open && <MatchEditor t={t} rounds={rounds} m={open} onClose={() => navigate('bracket')} />}
    </div>
  );
}

function MatchCard({ t, m }: { t: Tournament; m: MatchView }) {
  const ready = m.a.kind === 'team' && m.b.kind === 'team';
  const bye = !isPlayable(m);
  const row = (s: Side, wins: number) => {
    const team = t.teams.find((x) => x.id === sideId(s));
    const won = m.winner.kind === 'team' && sideId(m.winner) === sideId(s);
    const lost = m.winner.kind === 'team' && !won && s.kind === 'team';
    return (
      <div className={`match-team ${won ? 'won' : ''} ${lost ? 'lost' : ''}`}>
        {team ? (
          <TeamName name={team.name} color={team.color} />
        ) : (
          <span className="muted">{s.kind === 'bye' ? '―' : '未定'}</span>
        )}
        {ready && <span className="wins">{m.record?.override ? (won ? 'W' : '-') : wins}</span>}
      </div>
    );
  };
  return (
    <button
      className={`match ${bye ? 'bye' : ''} ${ready ? 'ready' : ''}`}
      disabled={!ready}
      onClick={() => navigate('bracket', m.key)}
    >
      <span className="match-no">#{m.index + 1}</span>
      {row(m.a, m.winsA)}
      {row(m.b, m.winsB)}
    </button>
  );
}

function SlotEditor({ t }: { t: Tournament }) {
  const slots = t.bracket.slots;
  const setSlot = (i: number, id: string) =>
    updateCurrent((d) => {
      const value = id || null;
      // 同じチームを 2 か所に置かないよう、元の位置と入れ替える
      const prev = d.bracket.slots.indexOf(value);
      if (value && prev >= 0) d.bracket.slots[prev] = d.bracket.slots[i];
      d.bracket.slots[i] = value;
    });
  return (
    <section className="card">
      <h2>1回戦の枠</h2>
      <p className="muted small">
        既に配置されているチームを選ぶと位置を入れ替えます。「空き」は相手の不戦勝になります。枠を変えると、対戦カードが変わった試合の記録は無効になります。
      </p>
      <div className="slot-grid">
        {Array.from({ length: slots.length / 2 }, (_, i) => (
          <div key={i} className="slot-pair">
            <span className="muted small">#{i + 1}</span>
            {[2 * i, 2 * i + 1].map((j) => (
              <select key={j} className="input" value={slots[j] ?? ''} onChange={(e) => setSlot(j, e.target.value)}>
                <option value="">（空き）</option>
                {t.teams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
