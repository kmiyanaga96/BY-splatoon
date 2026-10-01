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
let adapter: StorageAdapter = localStorageAdapter;
let state: AppData = emptyData();
/** 最後に保存先へ送った (または保存先から受け取った) 内容。差分の基準 */
let snapshot: Snapshot = new Map();
let saveError: string | null = null;
let saving: Promise<void> = Promise.resolve();
let unsubscribeRemote: (() => void) | undefined;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = 0;
/** 自分の保存中に届いた他所からの更新。保存が終わってから反映する */
let deferredRemote: unknown | null = null;
export type StorageStatus = 'loading' | 'ready' | 'error';
let status: StorageStatus = 'ready';
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const hasPendingSave = () => inFlight > 0 || flushTimer !== undefined;

function flush() {
  flushTimer = undefined;
  const changes = diff(snapshot, state);
  if (isEmpty(changes)) return;
  snapshot = snapshotOf(state);
  const data = state;
  const target = adapter;
  inFlight++;
  saving = saving
    .then(() => target.save(data, changes))
    .then(
      () => {
        if (saveError) {
          saveError = null;
          emit();
        }
      },
      async (e) => {
        saveError = e instanceof Error ? e.message : String(e);
        emit();
        // 保存に失敗したら、保存先の内容に戻す (画面と保存先がずれたままにしない)
        try {
          deferredRemote = (await target.load()) ?? deferredRemote;
        } catch {
          /* 読み直せなければそのまま */
        }
      },
    )
    .finally(() => {
      inFlight--;
      if (!hasPendingSave() && deferredRemote) {
        const raw = deferredRemote;
        deferredRemote = null;
        receiveRemote(raw);
      }
    });
}

function persist() {
  if (adapter.debounceMs) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, adapter.debounceMs);
  } else {
    flush();
  }
}

function receiveRemote(raw: unknown) {
  if (hasPendingSave()) {
    deferredRemote = raw;
    return;
  }
  state = withLocalCurrent({ ...normalizeData(raw), currentId: state.currentId });
  snapshot = snapshotOf(state);
  emit();
}

/** 保存先を切り替え、そこからデータを読み込む */
export async function connectStorage(next: StorageAdapter) {
  unsubscribeRemote?.();
  adapter = next;
  status = 'loading';
  emit();
  try {
    const raw = await next.load();
    state = withLocalCurrent(normalizeData(raw));
    snapshot = snapshotOf(state);
    status = 'ready';
  } catch (e) {
    console.error(e);
    saveError = `データを読み込めませんでした: ${e instanceof Error ? e.message : e}`;
    status = 'error';
  }
  emit();
  unsubscribeRemote = next.subscribe?.(receiveRemote);
}

/** 保存先の準備中 (読み込みが終わるまで編集できないようにする) */
export function markLoading() {
  status = 'loading';
  emit();
}

/** localStorage 版で起動する (同期的に読めるので画面が空で出ない) */
export function startLocal() {
  const raw = hasStorage ? loadLocalSync() : null;
  adapter = localStorageAdapter;
  state = withLocalCurrent(raw ? normalizeData(raw) : emptyData());
  snapshot = new Map(); // 空から始めると初回は全件が「変更」になり、v1 データも v2 で保存し直される
  if (hasStorage) {
    persist();
    unsubscribeRemote = adapter.subscribe?.(receiveRemote);
  }
  emit();
}

if (typeof window !== 'undefined') {
  // まだ送っていない変更があるうちにページを閉じようとしたら、すぐ送って確認を出す
  window.addEventListener('beforeunload', (e) => {
    if (!hasPendingSave()) return;
    if (flushTimer) flush();
    e.preventDefault();
  });
}

// ---- 編集権限 (Firebase では編集者だけが書き込める) ----

let canEdit: () => boolean = () => true;
let onBlocked: () => void = () => {};

export function setEditGuard(allowed: () => boolean, blocked: () => void) {
  canEdit = allowed;
  onBlocked = blocked;
  emit();
}

export function useCanEdit(): boolean {
  useApp();
  return canEdit();
}

export function useStorageStatus(): StorageStatus {
  useApp();
  return status;
}

export function getState(): AppData {
  return state;
}

export function setState(next: AppData) {
  if (!canEdit()) {
    onBlocked();
    emit(); // 入力欄を元の値に戻す
    return;
  }
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

/** 表示する大会を切り替える (この端末だけの設定なので、閲覧モードでも変えられる) */
export function selectTournament(id: string) {
  state = { ...state, currentId: id };
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* 覚えられなくても動作に支障はない */
  }
  emit();
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

export function isLocalStorage(): boolean {
  return adapter === localStorageAdapter;
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
  return importData(JSON.parse(text));
}

/** 読み込んだデータ (JSON・このブラウザの旧データ) を取り込む */
export function importData(parsed: any): string[] {
  if (!canEdit()) throw new Error('閲覧モードでは取り込めません。編集者のアカウントでログインしてください');
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
