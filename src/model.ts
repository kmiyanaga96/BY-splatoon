// データの生成・読み込み時の補完・旧形式からの移行。
// 保存先 (localStorage / Firebase) や JSON の読み込みから来たデータは、必ずここを通してから使う。

import type { AppData, Bracket, Game, Member, Player, Rules, Team, Tournament } from './types';

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
    members: [],
    pool: [],
  };
}

export function newPlayer(name = ''): Player {
  return { id: newId(), name, discord: '', xp: null, avatar: '', mains: [], note: '' };
}

export function newMember(playerId: string): Member {
  return { playerId, leader: false, featured: false, comment: '' };
}

export function newGame(prev?: Game, keepWeapons = false): Game {
  return {
    weaponA: keepWeapons ? (prev?.weaponA ?? '') : '',
    weaponB: keepWeapons ? (prev?.weaponB ?? '') : '',
    mode: prev?.mode ?? '',
    stage: '',
    winner: null,
    lineupA: prev?.lineupA ?? null,
    lineupB: prev?.lineupB ?? null,
  };
}

export function emptyData(): AppData {
  const t = newTournament('ブキ統一杯');
  return { version: 2, currentId: t.id, players: [], tournaments: [t] };
}

// ---- 補完用の小道具 ----

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const arr = <T>(v: unknown, f: (x: any, i: number) => T): T[] => (Array.isArray(v) ? v.map(f) : []);
const strArr = (v: unknown) => arr(v, (x) => str(x)).filter(Boolean);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 旧データの自由記述 ("XP2500 / S+10" など) から Xパワーを拾う */
export function parseXp(text: string): number | null {
  const m = text.normalize('NFKC').match(/X\s*P?\s*[:：]?\s*(\d{4})/i);
  return m ? Number(m[1]) : null;
}

/** 同じ人かどうかを名前で判定するためのキー (旧データの移行・JSON 取り込み時に使う) */
export function nameKey(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
}

const isImageUrl = (s: string) => s.startsWith('data:image/') || s.startsWith('https://');

export function normalizePlayer(p: any): Player {
  const note = str(p?.note) || str(p?.rank);
  const xp = num(p?.xp) ?? (p?.xp === null ? null : parseXp(note));
  const avatar = str(p?.avatar);
  return {
    id: str(p?.id) || newId(),
    name: str(p?.name),
    discord: str(p?.discord),
    xp,
    avatar: isImageUrl(avatar) ? avatar : '',
    mains: strArr(p?.mains),
    note,
  };
}

function normalizeMember(m: any): Member {
  return {
    playerId: str(m?.playerId),
    leader: !!m?.leader,
    featured: !!m?.featured,
    comment: str(m?.comment),
  };
}

const lineup = (v: unknown): string[] | null => (Array.isArray(v) ? strArr(v) : null);

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
        mode: str(g?.mode) as Game['mode'],
        stage: str(g?.stage),
        winner: g?.winner === 'A' || g?.winner === 'B' ? g.winner : null,
        lineupA: lineup(g?.lineupA),
        lineupB: lineup(g?.lineupB),
      })),
      override: typeof m?.override === 'string' ? m.override : null,
      note: str(m?.note),
    };
  }
  // 枠数は 2 の累乗のみ有効
  const valid = slots.length >= 2 && (slots.length & (slots.length - 1)) === 0;
  return valid ? { slots, matches } : { slots: [], matches: {} };
}

/**
 * 旧形式 (v1: チームの中に選手情報を直接持つ) の選手を選手 DB に寄せる。
 * 同じ名前の選手は同一人物として 1 人にまとめ、空欄の項目だけ後から来た値で埋める。
 */
class PlayerIndex {
  readonly players = new Map<string, Player>();
  private byName = new Map<string, Player>();

  constructor(existing: Player[] = []) {
    for (const p of existing) this.add(p);
  }

  add(p: Player) {
    this.players.set(p.id, p);
    const key = nameKey(p.name);
    if (key && !this.byName.has(key)) this.byName.set(key, p);
  }

  /** 旧形式の選手データを取り込み、対応する選手 ID を返す */
  absorbLegacy(raw: any): string {
    const incoming = normalizePlayer(raw);
    const key = nameKey(incoming.name);
    const found = (key && this.byName.get(key)) || this.players.get(incoming.id);
    if (!found) {
      if (this.players.has(incoming.id)) incoming.id = newId();
      this.add(incoming);
      return incoming.id;
    }
    found.xp ??= incoming.xp;
    found.avatar ||= incoming.avatar;
    found.note ||= incoming.note;
    if (!found.mains.length) found.mains = incoming.mains;
    return found.id;
  }
}

function normalizeTeam(t: any, i: number, index: PlayerIndex): Team {
  const base = newTeam(i);
  // v1 は players: [{ name, xp, ..., leader, featured, comment }]
  const members = Array.isArray(t?.members)
    ? arr(t.members, normalizeMember).filter((m) => m.playerId)
    : arr(t?.players, (p) => ({ ...normalizeMember(p), playerId: index.absorbLegacy(p) }));
  // 同じ選手の重複所属は除く
  const seen = new Set<string>();
  return {
    id: str(t?.id) || base.id,
    name: str(t?.name, base.name),
    color: str(t?.color, base.color),
    comment: str(t?.comment),
    members: members.filter((m) => !seen.has(m.playerId) && seen.add(m.playerId)),
    pool: strArr(t?.pool),
  };
}

export function normalizeTournament(t: any, index = new PlayerIndex()): Tournament {
  const base = newTournament();
  const teams = arr(t?.teams, (x, i) => normalizeTeam(x, i, index));
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

/**
 * 保存データ・読み込んだ JSON を現在の形式にそろえる。
 * existingPlayers を渡すと、旧形式の選手を名前でその選手 DB に合流させる (JSON 取り込み用)。
 */
export function normalizeData(d: any, existingPlayers: Player[] = []): AppData {
  const index = new PlayerIndex([...existingPlayers.map((p) => ({ ...p })), ...arr(d?.players, normalizePlayer)]);
  // 大会単体の JSON (トップレベルに teams がある) にも対応
  const rawTournaments = Array.isArray(d?.tournaments) ? d.tournaments : Array.isArray(d?.teams) ? [d] : [];
  const tournaments: Tournament[] = rawTournaments.map((t: any) => normalizeTournament(t, index));
  // 存在しない選手を参照している所属は外す
  for (const t of tournaments) for (const team of t.teams) team.members = team.members.filter((m: Member) => index.players.has(m.playerId));
  if (tournaments.length === 0) tournaments.push(newTournament('ブキ統一杯'));
  const currentId = tournaments.some((t) => t.id === d?.currentId) ? d.currentId : tournaments[0].id;
  return { version: 2, currentId, players: [...index.players.values()], tournaments };
}

/** 大会で参照している選手 ID */
export function referencedPlayerIds(tournaments: Tournament[]): Set<string> {
  return new Set(tournaments.flatMap((t) => t.teams.flatMap((team) => team.members.map((m) => m.playerId))));
}
