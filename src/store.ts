// アプリの状態管理。サーバーは使わず、ブラウザの localStorage に自動保存する。
// 他の運営メンバーとの受け渡しは JSON のエクスポート/インポートで行う。

import { useSyncExternalStore } from 'react';
import type { AppData, Bracket, Player, Rules, Team, Tournament } from './types';

const STORAGE_KEY = 'by-splatoon:v1';

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const defaultRules = (): Rules => ({
  poolMax: 3,
  reuse: 'match',
  allowDuplicate: true,
  bestOf: 3,
  finalBestOf: 5,
  teamSize: 4,
});

export function newTournament(name = '新しい大会'): Tournament {
  return {
    id: newId(),
    name,
    date: '',
    description: '',
    rules: defaultRules(),
    teams: [],
    bracket: { slots: [], matches: {} },
  };
}

const TEAM_COLORS = ['#f2e14c', '#7b5cff', '#ff5c8a', '#3fd2c7', '#ff9b3d', '#5c9dff', '#9be15d', '#e66cff'];

export function newTeam(index: number): Team {
  return {
    id: newId(),
    name: `チーム${index + 1}`,
    color: TEAM_COLORS[index % TEAM_COLORS.length],
    comment: '',
    players: [],
    pool: [],
  };
}

export function newPlayer(): Player {
  return { id: newId(), name: '', mains: [], rank: '', comment: '', featured: false, leader: false };
}

// ---- 読み込み時の補完 (古いデータや手書きの JSON でも落ちないように) ----

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const arr = <T>(v: unknown, f: (x: any, i: number) => T): T[] => (Array.isArray(v) ? v.map(f) : []);
const strArr = (v: unknown) => arr(v, (x) => str(x)).filter(Boolean);

function normalizePlayer(p: any): Player {
  return {
    id: str(p?.id) || newId(),
    name: str(p?.name),
    mains: strArr(p?.mains),
    rank: str(p?.rank),
    comment: str(p?.comment),
    featured: !!p?.featured,
    leader: !!p?.leader,
  };
}

function normalizeTeam(t: any, i: number): Team {
  const base = newTeam(i);
  return {
    id: str(t?.id) || base.id,
    name: str(t?.name, base.name),
    color: str(t?.color, base.color),
    comment: str(t?.comment),
    players: arr(t?.players, normalizePlayer),
    pool: strArr(t?.pool),
  };
}

function normalizeBracket(b: any, teamIds: Set<string>): Bracket {
  const slots = arr(b?.slots, (x) => (typeof x === 'string' && teamIds.has(x) ? x : null));
  const matches: Bracket['matches'] = {};
  for (const [key, m] of Object.entries<any>(b?.matches ?? {})) {
    matches[key] = {
      a: str(m?.a),
      b: str(m?.b),
      games: arr(m?.games, (g) => ({
        weaponA: str(g?.weaponA),
        weaponB: str(g?.weaponB),
        mode: str(g?.mode) as any,
        stage: str(g?.stage),
        winner: g?.winner === 'A' || g?.winner === 'B' ? g.winner : null,
      })),
      override: typeof m?.override === 'string' ? m.override : null,
      note: str(m?.note),
    };
  }
  // 枠数は 2 の累乗のみ有効
  const valid = slots.length >= 2 && (slots.length & (slots.length - 1)) === 0;
  return valid ? { slots, matches } : { slots: [], matches: {} };
}

export function normalizeTournament(t: any): Tournament {
  const base = newTournament();
  const teams = arr(t?.teams, normalizeTeam);
  const rules = { ...base.rules };
  for (const k of Object.keys(rules) as (keyof Rules)[]) {
    const v = t?.rules?.[k];
    if (typeof v === typeof rules[k] && (typeof v !== 'number' || Number.isFinite(v))) (rules as any)[k] = v;
  }
  return {
    id: str(t?.id) || base.id,
    name: str(t?.name, base.name),
    date: str(t?.date),
    description: str(t?.description),
    rules,
    teams,
    bracket: normalizeBracket(t?.bracket, new Set(teams.map((x) => x.id))),
  };
}

export function normalizeData(d: any): AppData {
  const tournaments = arr(d?.tournaments, normalizeTournament);
  if (tournaments.length === 0) tournaments.push(newTournament('ブキ統一杯'));
  const currentId = tournaments.some((t) => t.id === d?.currentId) ? d.currentId : tournaments[0].id;
  return { version: 1, currentId, tournaments };
}

// ---- ストア本体 ----

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch (e) {
    console.warn('保存データの読み込みに失敗しました', e);
  }
  return normalizeData(null);
}

let state: AppData = load();
let saveError: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveError = null;
  } catch (e) {
    saveError = String(e);
  }
}

export function getState(): AppData {
  return state;
}

export function setState(next: AppData) {
  state = next;
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

export function useApp(): AppData {
  return useSyncExternalStore(subscribe, getState);
}

export function useCurrent(): Tournament {
  const app = useApp();
  return app.tournaments.find((t) => t.id === app.currentId) ?? app.tournaments[0];
}

export function useSaveError(): string | null {
  useApp();
  return saveError;
}

// ---- 他タブで編集されたときに追従 ----
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        state = normalizeData(JSON.parse(e.newValue));
        emit();
      } catch {
        /* 壊れたデータは無視 */
      }
    }
  });
}

// ---- エクスポート / インポート ----

export function exportJson(tournaments: Tournament[]): string {
  const data: AppData = { version: 1, currentId: tournaments[0]?.id ?? '', tournaments };
  return JSON.stringify(data, null, 2);
}

/**
 * JSON を読み込んで大会を追加する。同じ ID の大会があれば上書き。
 * 読み込んだ大会の ID 一覧を返す。
 */
export function importJson(text: string): string[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed?.tournaments) && !Array.isArray(parsed?.teams)) {
    throw new Error('このツールの大会データではないようです');
  }
  // 大会単体の JSON にも対応
  const incoming = normalizeData(Array.isArray(parsed?.tournaments) ? parsed : { tournaments: [parsed] }).tournaments;
  update((d) => {
    for (const t of incoming) {
      const i = d.tournaments.findIndex((x) => x.id === t.id);
      if (i >= 0) d.tournaments[i] = t;
      else d.tournaments.push(t);
    }
    d.currentId = incoming[0].id;
  });
  return incoming.map((t) => t.id);
}
