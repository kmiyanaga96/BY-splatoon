import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, FilterChip, Icon, IconButton, Switch, WeaponIcon } from '../components/ui';
import { CATEGORIES, getWeapon, weaponKit, weaponName } from '../data/weapons';
import { roulettePool, spin } from '../lib/roulette';

const KEY = 'by-splatoon:roulette';

interface Saved {
  count: number;
  names: string[];
  categories: string[];
  replica: boolean;
  unique: boolean;
}

function load(): Saved {
  const fallback: Saved = { count: 4, names: [], categories: [], replica: false, unique: true };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

const SPIN_MS = 1600;

/** ランダムブキルーレット (ツールモード)。人数分のブキを抽選する。設定はこの端末に覚える */
export function RoulettePage() {
  const [s, setS] = useState<Saved>(load);
  const [result, setResult] = useState<string[]>([]);
  // 回している最中の見た目 (枠ごとに次々とブキを切り替える)
  const [rolling, setRolling] = useState<string[] | null>(null);
  const timer = useRef(0);
  const pool = useMemo(() => roulettePool(s), [s]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* 覚えられなくても使える */
    }
  }, [s]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const set = (patch: Partial<Saved>) => setS((x) => ({ ...x, ...patch }));
  const label = (i: number) => s.names[i]?.trim() || `${i + 1}P`;

  /** only を渡すとその枠だけ回し直す */
  const run = (only?: number) => {
    if (!pool.length || rolling) return;
    const keep = new Map<number, string>();
    if (only !== undefined) result.forEach((id, i) => i !== only && keep.set(i, id));
    const final = spin(s.count, pool, s.unique, keep);
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      if (t >= SPIN_MS) {
        setRolling(null);
        setResult(final);
        return;
      }
      setRolling(final.map((id, i) => (keep.has(i) ? id : pool[Math.floor(Math.random() * pool.length)].id)));
      // だんだん遅くする
      timer.current = window.setTimeout(tick, 40 + (t / SPIN_MS) ** 2 * 220);
    };
    tick();
  };

  const shown = rolling ?? result;
  const text = result.length ? ['🎲 ブキルーレット', ...result.map((id, i) => `${label(i)}：${weaponName(id)}`)].join('\n') : '';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="headline">ブキルーレット</h1>
      </div>

      <div className="roulette-layout">
        <section className="card roulette-settings">
          <h2 className="card-title">設定</h2>
          <label className="field">
            <span className="field-label">人数</span>
            <select className="input" value={s.count} onChange={(e) => set({ count: Number(e.target.value) })}>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} 人
                </option>
              ))}
            </select>
          </label>
          <span className="label">名前（任意）</span>
          <div className="roulette-names">
            {Array.from({ length: s.count }, (_, i) => (
              <input
                key={i}
                className="input"
                placeholder={`${i + 1}P`}
                maxLength={20}
                value={s.names[i] ?? ''}
                onChange={(e) => {
                  const names = [...s.names];
                  names[i] = e.target.value;
                  set({ names });
                }}
              />
            ))}
          </div>
          <span className="label">カテゴリ（選ばなければすべて）</span>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <FilterChip
                key={c.id}
                label={c.name}
                color={c.color}
                selected={s.categories.includes(c.id)}
                onClick={() =>
                  set({ categories: s.categories.includes(c.id) ? s.categories.filter((x) => x !== c.id) : [...s.categories, c.id] })
                }
              />
            ))}
          </div>
          <Switch label="同じブキを重ねない" checked={s.unique} onChange={(v) => set({ unique: v })} />
          <Switch label="レプリカ（ヒーロー・オーダーなど）も入れる" checked={s.replica} onChange={(v) => set({ replica: v })} />
          <p className="muted body-s">対象 {pool.length} 種</p>
        </section>

        <section className="card roulette-main">
          <div className="roulette-slots">
            {Array.from({ length: s.count }, (_, i) => {
              const id = shown[i];
              const w = id ? getWeapon(id) : undefined;
              return (
                <div key={i} className={`roulette-slot ${rolling ? 'rolling' : ''}`}>
                  <span className="roulette-player">{label(i)}</span>
                  <span className="roulette-icon">{id ? <WeaponIcon id={id} size={88} /> : <Icon name="casino" />}</span>
                  <span className="roulette-name">{w ? w.name : '？'}</span>
                  <span className="muted body-s">{w ? weaponKit(w.id) : ' '}</span>
                  {result[i] && !rolling && <IconButton icon="restart_alt" label={`${label(i)}だけ回し直す`} onClick={() => run(i)} />}
                </div>
              );
            })}
          </div>
          <div className="card-actions">
            {text && !rolling && <CopyButton text={text} label="結果をコピー" variant="tonal" />}
            <span className="spacer" />
            <button className="btn filled roulette-go" disabled={!pool.length || !!rolling} onClick={() => run()}>
              <Icon name="casino" />
              {rolling ? '回しています…' : result.length ? 'もう一度回す' : 'ルーレットを回す'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
