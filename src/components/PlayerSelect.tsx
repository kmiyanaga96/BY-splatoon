import { useMemo, useState } from 'react';
import { normalizeForSearch } from '../data/weapons';
import { nameKey } from '../model';
import type { Player } from '../types';
import { Avatar, Icon, Modal, XBadge } from './ui';

interface Props {
  title: string;
  players: Player[];
  /** 選べない選手と理由 (例: すでに別チームに所属) */
  unavailable: Map<string, string>;
  color: string;
  onSelect: (playerId: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}

/** 選手 DB から選ぶ。見つからなければその場で新規登録できる */
export function PlayerSelect(props: Props) {
  const [query, setQuery] = useState('');
  const q = normalizeForSearch(query);
  const list = useMemo(
    () =>
      props.players
        .filter((p) => !q || normalizeForSearch(`${p.name} ${p.discord}`).includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [props.players, q],
  );
  const exact = props.players.some((p) => nameKey(p.name) === nameKey(query));

  const create = () => {
    if (!query.trim()) return;
    props.onCreate(query.trim());
    setQuery('');
  };

  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      actions={
        <button className="btn filled" onClick={props.onClose}>
          完了
        </button>
      }
    >
      <div className="search">
        <Icon name="search" />
        <input
          className="input"
          placeholder="名前で検索、または新しい選手の名前を入力"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !exact && list.length === 0 && create()}
          autoFocus
        />
      </div>
      {query.trim() && !exact && (
        <button className="btn tonal" onClick={create}>
          <Icon name="person_add" />「{query.trim()}」を新しい選手として登録して追加
        </button>
      )}
      <ul className="player-select-list">
        {list.map((p) => {
          const reason = props.unavailable.get(p.id);
          return (
            <li key={p.id}>
              <button className="list-item player-select-item" disabled={!!reason} onClick={() => props.onSelect(p.id)}>
                <Avatar name={p.name} src={p.avatar} color={props.color} size={36} />
                <span className="player-select-name">
                  <b>{p.name || '(名前未入力)'}</b>
                  {p.discord && <span className="muted body-s">{p.discord}</span>}
                </span>
                <XBadge xp={p.xp} withValue />
                <span className="spacer" />
                {reason ? <span className="overline">{reason}</span> : <Icon name="add" />}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted body-s">該当する選手がいません</li>}
      </ul>
    </Modal>
  );
}
