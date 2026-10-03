import { useMemo, useState } from 'react';
import { CopyButton, Field, Icon, Switch } from '../components/ui';
import {
  DISCORD_LIMIT,
  allTeamsText,
  featuredText,
  matchCardText,
  overviewText,
  resultsText,
  standingsText,
  teamText,
  weaponStatsText,
} from '../lib/announce';
import { sideId, type MatchView } from '../lib/bracket';
import { kindOf } from '../lib/kinds';
import { allMatches } from '../lib/league';
import { usePlayers } from '../store';
import type { Tournament } from '../types';

type Kind = 'overview' | 'teams' | 'team' | 'featured' | 'match' | 'standings' | 'results' | 'weapons';

const KINDS: { id: Kind; label: string; icon: string }[] = [
  { id: 'overview', label: '大会概要・ルール', icon: 'info' },
  { id: 'teams', label: '全チーム紹介', icon: 'groups' },
  { id: 'team', label: 'チーム紹介（個別）', icon: 'groups' },
  { id: 'featured', label: '注目選手', icon: 'star' },
  { id: 'match', label: '対戦カード', icon: 'account_tree' },
  { id: 'standings', label: '予選リーグ順位', icon: 'leaderboard' },
  { id: 'results', label: '試合結果', icon: 'emoji_events' },
  { id: 'weapons', label: 'ブキ使用状況', icon: 'table_view' },
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
  const players = usePlayers();
  const [kind, setKind] = useState<Kind>('overview');
  const [teamId, setTeamId] = useState(t.teams[0]?.id ?? '');
  const matches = allMatches(t, rounds).filter((m) => m.a.kind === 'team' && m.b.kind === 'team');
  const [matchKey, setMatchKey] = useState(
    () => (matches.find((m) => m.winner.kind === 'tbd') ?? matches[0])?.key ?? '',
  );
  const [withWeapons, setWithWeapons] = useState(true);

  const generated = useMemo(() => {
    switch (kind) {
      case 'overview':
        return overviewText(t);
      case 'teams':
        return allTeamsText(t, players, rounds);
      case 'team': {
        const team = t.teams.find((x) => x.id === teamId);
        return team ? teamText(t, team, players, rounds) : 'チームを選んでください';
      }
      case 'featured':
        return featuredText(t, players);
      case 'match': {
        const m = matches.find((x) => x.key === matchKey);
        return m ? matchCardText(t, players, rounds, m) : '対戦カードが決まっている試合がありません';
      }
      case 'standings':
        return standingsText(t);
      case 'results':
        return resultsText(t, rounds, withWeapons);
      case 'weapons':
        return weaponStatsText(t, rounds);
    }
  }, [kind, t, players, rounds, teamId, matchKey, withWeapons]);

  // 生成した文章は貼り付け前に手直しできる。元の文章が変わったら手直しは破棄する
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(null);
  const text = draft?.base === generated ? draft.text : generated;
  const setText = (v: string) => setDraft({ base: generated, text: v });
  const parts = splitForDiscord(text);
  const teamName = (id: string | null) => t.teams.find((x) => x.id === id)?.name ?? '?';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="headline">告知文</h1>
        <p className="muted">Discord にそのまま貼り付けられる文章を作ります。右の欄で手直ししてからコピーできます。</p>
      </div>
      <div className="announce-layout">
        <section className="card announce-side">
          <h2 className="card-title">種類</h2>
          <div className="nav-list" role="radiogroup">
            {/* ブキ使用状況はブキを記録する大会だけ */}
            {KINDS.filter(
              (k) => (k.id !== 'weapons' || kindOf(t).teamWeapon || kindOf(t).playerWeapons) && (k.id !== 'standings' || !!t.league),
            ).map((k) => (
              <button
                key={k.id}
                role="radio"
                aria-checked={kind === k.id}
                className={`nav-list-item ${kind === k.id ? 'active' : ''}`}
                onClick={() => setKind(k.id)}
              >
                <Icon name={k.icon} filled={kind === k.id} />
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
                    {m.label}: {teamName(sideId(m.a))} vs {teamName(sideId(m.b))}
                    {m.winner.kind === 'team' ? '（終了）' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === 'results' && kindOf(t).teamWeapon && (
            <Switch label="各ゲームの使用ブキも載せる" checked={withWeapons} onChange={setWithWeapons} />
          )}
        </section>

        <section className="card announce-main">
          <textarea
            className="input announce-text"
            rows={18}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="告知文"
          />
          <div className="card-actions">
            <span className={text.length > DISCORD_LIMIT ? 'warn-text' : 'muted'}>
              {text.length} / {DISCORD_LIMIT} 文字
            </span>
            <span className="spacer" />
            <button className="btn text" onClick={() => setDraft(null)}>
              <Icon name="restart_alt" />
              元に戻す
            </button>
            {parts.length <= 1 && <CopyButton text={text} />}
          </div>
          {parts.length > 1 && (
            <div className="banner warn">
              <Icon name="info" />
              Discord の 1 メッセージの上限を超えるため、{parts.length} 回に分けて投稿してください。
              <div className="row">
                {parts.map((p, i) => (
                  <CopyButton key={i} text={p} label={`${i + 1}/${parts.length}`} variant="tonal" />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
