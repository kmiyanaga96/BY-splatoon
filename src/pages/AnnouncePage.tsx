import { useMemo, useState } from 'react';
import { CopyButton, Field } from '../components/ui';
import {
  DISCORD_LIMIT,
  allTeamsText,
  featuredText,
  matchCardText,
  overviewText,
  resultsText,
  teamText,
  weaponStatsText,
} from '../lib/announce';
import { roundName, sideId, type MatchView } from '../lib/bracket';
import type { Tournament } from '../types';

type Kind = 'overview' | 'teams' | 'team' | 'featured' | 'match' | 'results' | 'weapons';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'overview', label: '大会概要・ルール' },
  { id: 'teams', label: '全チーム紹介' },
  { id: 'team', label: 'チーム紹介（個別）' },
  { id: 'featured', label: '注目選手' },
  { id: 'match', label: '対戦カード' },
  { id: 'results', label: '試合結果' },
  { id: 'weapons', label: 'ブキ使用状況' },
];

/** Discord の文字数制限を超える文章を、行単位で分割する */
function splitForDiscord(text: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (const line of text.split('\n')) {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length > DISCORD_LIMIT && cur) {
      parts.push(cur);
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

export function AnnouncePage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const [kind, setKind] = useState<Kind>('overview');
  const [teamId, setTeamId] = useState(t.teams[0]?.id ?? '');
  const matches = rounds.flat().filter((m) => m.a.kind === 'team' && m.b.kind === 'team');
  const [matchKey, setMatchKey] = useState(
    () => (matches.find((m) => m.winner.kind === 'tbd') ?? matches[0])?.key ?? '',
  );
  const [withWeapons, setWithWeapons] = useState(true);

  const generated = useMemo(() => {
    switch (kind) {
      case 'overview':
        return overviewText(t);
      case 'teams':
        return allTeamsText(t, rounds);
      case 'team': {
        const team = t.teams.find((x) => x.id === teamId);
        return team ? teamText(t, team, rounds) : 'チームを選んでください';
      }
      case 'featured':
        return featuredText(t);
      case 'match': {
        const m = matches.find((x) => x.key === matchKey);
        return m ? matchCardText(t, rounds, m) : '対戦カードが決まっている試合がありません';
      }
      case 'results':
        return resultsText(t, rounds, withWeapons);
      case 'weapons':
        return weaponStatsText(t, rounds);
    }
  }, [kind, t, rounds, teamId, matchKey, withWeapons]);

  // 生成した文章は貼り付け前に手直しできる。元の文章が変わったら手直しは破棄する
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(null);
  const text = draft?.base === generated ? draft.text : generated;
  const setText = (v: string) => setDraft({ base: generated, text: v });
  const parts = splitForDiscord(text);
  const teamName = (id: string | null) => t.teams.find((x) => x.id === id)?.name ?? '?';

  return (
    <div className="stack">
      <h1>告知文</h1>
      <p className="muted">Discord にそのまま貼り付けられる文章を作ります。下の欄で手直ししてからコピーできます。</p>
      <div className="chips">
        {KINDS.map((k) => (
          <button key={k.id} className={`chip ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      {kind === 'team' && (
        <Field label="チーム">
          <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {t.teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {kind === 'match' && (
        <Field label="試合">
          <select className="input" value={matchKey} onChange={(e) => setMatchKey(e.target.value)}>
            {matches.map((m) => (
              <option key={m.key} value={m.key}>
                {roundName(m.round, rounds.length)} #{m.index + 1}: {teamName(sideId(m.a))} vs {teamName(sideId(m.b))}
                {m.winner.kind === 'team' ? '（終了）' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      {kind === 'results' && (
        <label className="check">
          <input type="checkbox" checked={withWeapons} onChange={(e) => setWithWeapons(e.target.checked)} />
          各ゲームの使用ブキも載せる
        </label>
      )}

      <textarea className="input announce-text" rows={16} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <span className={text.length > DISCORD_LIMIT ? 'warn-text' : 'muted'}>
          {text.length} / {DISCORD_LIMIT} 文字
        </span>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => setDraft(null)}>
          元に戻す
        </button>
        {parts.length <= 1 && <CopyButton text={text} />}
      </div>
      {parts.length > 1 && (
        <section className="card">
          <p className="warn-text">Discord の 1 メッセージの上限を超えるため、{parts.length} 回に分けて投稿してください。</p>
          <div className="row">
            {parts.map((p, i) => (
              <CopyButton key={i} text={p} label={`${i + 1}/${parts.length} をコピー`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
