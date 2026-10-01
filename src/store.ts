// アプリの状態管理。画面はこのメモリ上の状態を読み書きし、変更は保存先 (StorageAdapter) に送る。
// いまの保存先は localStorage。Firebase 版ができたら connectStorage() で差し替える。

import { useMemo, useSyncExternalStore } from 'react';
import { emptyData, normalizeData, referencedPlayerIds } from './model';
import { loadLocalSync, localStorageAdapter } from './storage/local';
import type { Changes, StorageAdapter } from './storage/types';
import type { AppData, Player, PlayerMap, Tournament } from './types';

export type { PlayerMap };

export { newGame, newId, newMember, newPlayer, newTeam, newTournament } from './model';


/** 表示中の大会はこの端末だけの設定として持つ (保存先が共有になっても他人の画面を変えない) */
const CURRENT_KEY = 'by-splatoon:current';

function readCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

function withLocalCurrent(data: AppData): AppData {
  const id = readCurrentId();
  return id && data.tournaments.some((t) => t.id === id) ? { ...data, currentId: id } : data;
}

// ---- 差分の検出 ----

type Snapshot = Map<string, string>;

function snapshotOf(data: AppData): Snapshot {
  const s: Snapshot = new Map();
  for (const p of data.players) s.set(`p:${p.id}`, JSON.stringify(p));
  for (const t of data.tournaments) s.set(`t:${t.id}`, JSON.stringify(t));
  return s;
}

function diff(prev: Snapshot, data: AppData): Changes {
  const changes: Changes = { players: { upserted: [], deleted: [] }, tournaments: { upserted: [], deleted: [] } };
  const seen = new Set<string>();
  for (const p of data.players) {
    const key = `p:${p.id}`;
    seen.add(key);
    if (prev.get(key) !== JSON.stringify(p)) changes.players.upserted.push(p);
  }
  for (const t of data.tournaments) {
    const key = `t:${t.id}`;
    seen.add(key);
    if (prev.get(key) !== JSON.stringify(t)) changes.tournaments.upserted.push(t);
  }
  for (const key of prev.keys()) {
    if (seen.has(key)) continue;
    if (key.startsWith('p:')) changes.players.deleted.push(key.slice(2));
    else changes.tournaments.deleted.push(key.slice(2));
  }
  return changes;
}

const isEmpty = (c: Changes) =>
  !c.players.upserted.length && !c.players.deleted.length && !c.tournaments.upserted.length && !c.tournaments.deleted.length;

// ---- 状態 ----

const hasStorage = typeof localStorage !== 'undefined';
const initialRaw = hasStorage ? loadLocalSync() : null;
let adapter: StorageAdapter = localStorageAdapter;
let state: AppData = withLocalCurrent(initialRaw ? normalizeData(initialRaw) : emptyData());
let snapshot: Snapshot = new Map(); // 空から始めると初回は全件が「変更」になり、v1 データも v2 で保存し直される
let saveError: string | null = null;
let saving: Promise<void> = Promise.resolve();
let unsubscribeRemote: (() => void) | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function persist() {
  const changes = diff(snapshot, state);
  if (isEmpty(changes)) return;
  snapshot = snapshotOf(state);
  const data = state;
  saving = saving
    .then(() => adapter.save(data, changes))
    .then(
      () => {
        if (saveError) {
          saveError = null;
          emit();
        }
      },
      (e) => {
        saveError = e instanceof Error ? e.message : String(e);
        emit();
      },
    );
}

function receiveRemote(raw: unknown) {
  state = withLocalCurrent(normalizeData(raw));
  snapshot = snapshotOf(state);
  emit();
}

/** 保存先を切り替える。保存先にデータがなければ、いまのデータをそこへ書き込む */
export async function connectStorage(next: StorageAdapter) {
  unsubscribeRemote?.();
  adapter = next;
  const raw = await next.load();
  if (raw) receiveRemote(raw);
  else {
    snapshot = new Map();
    persist();
  }
  unsubscribeRemote = next.subscribe?.(receiveRemote);
}

if (hasStorage) {
  persist();
  unsubscribeRemote = adapter.subscribe?.(receiveRemote);
}

export function getState(): AppData {
  return state;
}

export function setState(next: AppData) {
  state = next;
  try {
    localStorage.setItem(CURRENT_KEY, next.currentId);
  } catch {
    /* 表示中の大会を覚えられなくても動作に支障はない */
  }
  persist();
  emit();
}

/** 状態をコピーしてから fn で書き換える (データは小さいので丸ごとコピーで十分) */
export function update(fn: (draft: AppData) => void) {
  const draft = structuredClone(state);
  fn(draft);
  setState(draft);
}

export function updateCurrent(fn: (t: Tournament) => void) {
  update((d) => {
    const t = d.tournaments.find((x) => x.id === d.currentId);
    if (t) fn(t);
  });
}

export function updatePlayer(id: string, fn: (p: Player) => void) {
  update((d) => {
    const p = d.players.find((x) => x.id === id);
    if (p) fn(p);
  });
}

export function useApp(): AppData {
  return useSyncExternalStore(subscribe, getState);
}

export function useCurrent(): Tournament {
  const app = useApp();
  return app.tournaments.find((t) => t.id === app.currentId) ?? app.tournaments[0];
}

export function usePlayers(): PlayerMap {
  const players = useApp().players;
  return useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
}

export function useSaveError(): string | null {
  useApp();
  return saveError;
}

export function storageName(): string {
  return adapter.name;
}

// ---- エクスポート / インポート ----

/** 大会と、その大会に出ている選手をまとめて書き出す */
export function exportJson(tournaments: Tournament[], allPlayers = false): string {
  const ids = referencedPlayerIds(tournaments);
  const players = state.players.filter((p) => allPlayers || ids.has(p.id));
  const data: AppData = { version: 2, currentId: tournaments[0]?.id ?? '', players, tournaments };
  return JSON.stringify(data, null, 2);
}

/**
 * JSON を読み込んで大会と選手を追加する。同じ ID の大会・選手は上書き。
 * 旧形式 (選手 DB 導入前) の JSON は、名前が同じ選手を既存の選手にまとめる。
 * 読み込んだ大会の ID 一覧を返す。
 */
export function importJson(text: string): string[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed?.tournaments) && !Array.isArray(parsed?.teams)) {
    throw new Error('このツールの大会データではないようです');
  }
  const incoming = normalizeData(parsed, state.players);
  update((d) => {
    const players = new Map(d.players.map((p) => [p.id, p]));
    for (const p of incoming.players) players.set(p.id, p);
    d.players = [...players.values()];
    // 初期状態の空の大会しかなければ、取り込んだ大会で置き換える
    if (d.tournaments.length === 1 && d.tournaments[0].teams.length === 0 && !d.tournaments[0].description) d.tournaments = [];
    for (const t of incoming.tournaments) {
      const i = d.tournaments.findIndex((x) => x.id === t.id);
      if (i >= 0) d.tournaments[i] = t;
      else d.tournaments.push(t);
    }
    d.currentId = incoming.tournaments[0].id;
  });
  return incoming.tournaments.map((t) => t.id);
}
