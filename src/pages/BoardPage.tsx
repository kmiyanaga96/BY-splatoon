import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useAuthView } from '../backend';
import { Icon, IconButton, showSnackbar } from '../components/ui';
import stages from '../data/stages.json';
import subspe from '../data/subspe.json';
import { WEAPONS, matchesQuery, normalizeForSearch, weaponIconUrl } from '../data/weapons';
import {
  BOARD_RULES,
  DEFAULT_ASPECT,
  PHASES,
  STROKE_COLORS,
  STROKE_WIDTHS,
  boardKey,
  hitTest,
  moveItem,
  parseBoards,
  renderBoard,
  type BoardItem,
  type BoardRule,
  type IconKind,
  type Phase,
  type StrokeItem,
} from '../lib/board';

type Tool = 'select' | 'pen' | 'arrow' | 'eraser';

const TOOLS: { value: Tool; label: string; icon: string; hint: string }[] = [
  { value: 'select', label: '選択', icon: 'arrow_selector_tool', hint: 'ドラッグで移動、Delete キーで削除' },
  { value: 'pen', label: 'ペン', icon: 'edit', hint: 'ドラッグで線を描画' },
  { value: 'arrow', label: '矢印', icon: 'north_east', hint: 'ドラッグで矢印を描画' },
  { value: 'eraser', label: '消しゴム', icon: 'ink_eraser', hint: 'なぞったものを消す' },
];

const BOARDS_KEY = 'by-splatoon:boards';
const UI_KEY = 'by-splatoon:board-ui';

interface UiState {
  stage: string;
  rule: BoardRule;
  phase: Phase;
  color: string;
  width: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できなくてもボードは使える */
  }
}

const newId = () => Math.random().toString(36).slice(2, 10);
const subspeUrl = (id: string) => `${import.meta.env.BASE_URL}subspe/${id}.png`;
const iconUrl = (kind: IconKind, ref: string) => (kind === 'weapon' ? weaponIconUrl(ref) : subspeUrl(ref));

interface PaletteEntry {
  kind: IconKind;
  ref: string;
  name: string;
  url: string;
}

const PALETTE: Record<IconKind, PaletteEntry[]> = {
  weapon: WEAPONS.map((w) => ({ kind: 'weapon', ref: w.id, name: w.name, url: weaponIconUrl(w.id) })),
  sub: subspe.filter((x) => x.kind === 'sub').map((x) => ({ kind: 'sub', ref: x.id, name: x.name, url: subspeUrl(x.id) })),
  special: subspe.filter((x) => x.kind === 'special').map((x) => ({ kind: 'special', ref: x.id, name: x.name, url: subspeUrl(x.id) })),
};

const PALETTE_TABS: { value: IconKind; label: string; placeholder: string }[] = [
  { value: 'weapon', label: 'ブキ', placeholder: 'ブキ名で検索' },
  { value: 'sub', label: 'サブ', placeholder: 'サブ名で検索' },
  { value: 'special', label: 'スペシャル', placeholder: 'スペシャル名で検索' },
];

/** 画像ファイルを、Firestore に入る大きさ (1MB 未満) の JPEG の data URL にする */
async function compressMap(file: Blob, maxChars: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('画像を読み込めませんでした'));
      i.src = url;
    });
    let width = Math.min(img.naturalWidth, 1920);
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width);
      canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * width);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.75, 0.65]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.length <= maxChars) return data;
      }
      width *= 0.85;
    }
    throw new Error('画像が大きすぎて縮小できませんでした');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 作戦ボード (ツールモード)。ステージ × ルールの画像の上に、ブキ・サブ・スペシャルのアイコンや線・矢印を描いて画像に保存する。
 * ステージ画像は編集者が登録して全員で共有する。描いた内容はこの端末にだけ一時保存する (共有はしない)
 */
export function BoardPage() {
  const auth = useAuthView();
  const [ui, setUi] = useState<UiState>(() => {
    const saved = readJson<Partial<UiState>>(UI_KEY, {});
    return {
      stage: stages.includes(saved.stage ?? '') ? saved.stage! : stages[0],
      rule: BOARD_RULES.includes(saved.rule as BoardRule) ? (saved.rule as BoardRule) : 'エリア',
      phase: PHASES.some((p) => p.value === saved.phase) ? saved.phase! : 'opening',
      color: saved.color ?? STROKE_COLORS[0],
      width: saved.width ?? 6,
    };
  });
  const setUiPart = (patch: Partial<UiState>) => setUi((u) => ({ ...u, ...patch }));
  const [boards, setBoards] = useState<Record<string, BoardItem[]>>(() => parseBoards(readJson(BOARDS_KEY, {})));
  const [tool, setTool] = useState<Tool>('arrow');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PaletteEntry | null>(null);
  const [tab, setTab] = useState<IconKind>('weapon');
  const [query, setQuery] = useState('');
  // ステージ画像 ("ルール:ステージ" → data URL / null = 未登録 / undefined = 読み込み中)
  const [maps, setMaps] = useState<Record<string, string | null>>({});
  const [mapImg, setMapImg] = useState<HTMLImageElement | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [, setIconsLoaded] = useState(0);
  const [, setHistoryVersion] = useState(0);

  const key = boardKey(ui.stage, ui.rule, ui.phase);
  const items = useMemo(() => boards[key] ?? [], [boards, key]);
  const mapKey = `${ui.rule}:${ui.stage}`;
  const mapData = maps[mapKey];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  const icons = useRef(new Map<string, HTMLImageElement>());
  const history = useRef(new Map<string, { past: BoardItem[][]; future: BoardItem[][] }>());
  const draft = useRef<StrokeItem | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; before: BoardItem[]; moved: boolean } | null>(null);
  const erasing = useRef<{ before: BoardItem[]; changed: boolean } | null>(null);

  // 設定・ボードはこの端末に保存する
  useEffect(() => writeJson(UI_KEY, ui), [ui]);
  useEffect(() => {
    const t = window.setTimeout(() => writeJson(BOARDS_KEY, boards), 300);
    return () => window.clearTimeout(t);
  }, [boards]);

  // ステージ画像を読み込む (一度読んだものは覚えておく)
  useEffect(() => {
    if (mapKey in maps) return;
    let alive = true;
    import('../firebase/stageMaps')
      .then((m) => m.loadStageMap(ui.stage, ui.rule))
      .then((data) => alive && setMaps((x) => ({ ...x, [mapKey]: data })))
      .catch((e) => {
        console.warn('ステージ画像を読み込めませんでした', e);
        if (alive) setMaps((x) => ({ ...x, [mapKey]: null }));
      });
    return () => {
      alive = false;
    };
  }, [mapKey, maps, ui.stage, ui.rule]);

  useEffect(() => {
    if (!mapData) {
      setMapImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setMapImg(img);
    img.src = mapData;
  }, [mapData]);

  const aspect = mapImg ? mapImg.naturalWidth / mapImg.naturalHeight : DEFAULT_ASPECT;

  // 表示幅に合わせてキャンバスの大きさを決める
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // 縦長のマップでも画面に収まるよう、高さは画面の高さまでにする
    const update = () => {
      const maxH = Math.max(320, window.innerHeight - 340);
      const w = Math.min(el.clientWidth, Math.round(maxH * aspect));
      setSize({ w, h: Math.round(w / aspect) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [aspect]);

  const iconImage = useCallback((kind: IconKind, ref: string) => {
    const k = `${kind}:${ref}`;
    if (!icons.current.has(k)) {
      const img = new Image();
      img.onload = () => setIconsLoaded((n) => n + 1);
      img.src = iconUrl(kind, ref);
      icons.current.set(k, img);
    }
    return icons.current.get(k)!;
  }, []);

  // 描き直し
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const it of items) if (it.type === 'icon') iconImage(it.kind, it.ref);
    const loaded = new Map([...icons.current].filter(([, img]) => img.complete && img.naturalWidth > 0));
    renderBoard(ctx, size.w, size.h, mapImg, draft.current ? [...items, draft.current] : items, loaded, selectedId);
  });

  // ---- 変更と取り消し ----

  const hist = (k: string) => {
    if (!history.current.has(k)) history.current.set(k, { past: [], future: [] });
    return history.current.get(k)!;
  };
  /** before → next に変えたことを記録して反映する */
  const commit = (next: BoardItem[], before: BoardItem[] = items) => {
    const h = hist(key);
    h.past.push(before);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    setBoards((b) => ({ ...b, [key]: next }));
    setHistoryVersion((v) => v + 1);
  };
  const undo = () => {
    const h = hist(key);
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(items);
    setBoards((b) => ({ ...b, [key]: prev }));
    setSelectedId(null);
    setHistoryVersion((v) => v + 1);
  };
  const redo = () => {
    const h = hist(key);
    const next = h.future.pop();
    if (!next) return;
    h.past.push(items);
    setBoards((b) => ({ ...b, [key]: next }));
    setHistoryVersion((v) => v + 1);
  };
  const removeSelected = () => {
    if (!selectedId) return;
    commit(items.filter((x) => x.id !== selectedId));
    setSelectedId(null);
  };
  const clearAll = () => {
    if (!items.length || !confirm(`「${PHASES.find((p) => p.value === ui.phase)?.label}」のボードをすべて消しますか？`)) return;
    commit([]);
    setSelectedId(null);
  };

  // キーボード: Delete で削除、Ctrl+Z / Ctrl+Shift+Z で取り消し・やり直し
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        removeSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- マウス・タッチ ----

  const point = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const placeIcon = (entry: PaletteEntry, x: number, y: number) => {
    const it: BoardItem = { type: 'icon', id: newId(), kind: entry.kind, ref: entry.ref, color: ui.color, x, y };
    commit([...items, it]);
    setSelectedId(it.id);
  };

  const eraseAt = (x: number, y: number) => {
    const hit = hitTest(items, x, y, size.w, size.h);
    if (!hit || !erasing.current) return;
    erasing.current.changed = true;
    setBoards((b) => ({ ...b, [key]: (b[key] ?? []).filter((it) => it.id !== hit.id) }));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const [x, y] = point(e);
    if (pending) {
      placeIcon(pending, x, y);
      setPending(null);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'pen' || tool === 'arrow') {
      draft.current = { type: 'stroke', id: newId(), color: ui.color, width: ui.width, arrow: tool === 'arrow', points: [[x, y]] };
      setSelectedId(null);
      setHistoryVersion((v) => v + 1);
    } else if (tool === 'eraser') {
      erasing.current = { before: items, changed: false };
      eraseAt(x, y);
    } else {
      const hit = hitTest(items, x, y, size.w, size.h);
      setSelectedId(hit?.id ?? null);
      if (hit) drag.current = { id: hit.id, x, y, before: items, moved: false };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const [x, y] = point(e);
    if (draft.current) {
      const last = draft.current.points[draft.current.points.length - 1];
      // 2px 以上動いたときだけ点を足す
      if (Math.hypot((x - last[0]) * size.w, (y - last[1]) * size.h) >= 2) {
        draft.current = { ...draft.current, points: [...draft.current.points, [x, y]] };
        setHistoryVersion((v) => v + 1);
      }
    } else if (erasing.current) {
      eraseAt(x, y);
    } else if (drag.current) {
      const d = drag.current;
      const dx = x - d.x;
      const dy = y - d.y;
      d.x = x;
      d.y = y;
      d.moved = true;
      setBoards((b) => ({ ...b, [key]: (b[key] ?? []).map((it) => (it.id === d.id ? moveItem(it, dx, dy) : it)) }));
    }
  };

  const onPointerUp = () => {
    if (draft.current) {
      const s = draft.current;
      draft.current = null;
      // 矢印は 2 点以上あるときだけ (タップだけでは描かない)
      if (s.points.length > 1 || !s.arrow) commit([...items, s]);
      else setHistoryVersion((v) => v + 1);
    } else if (erasing.current) {
      const er = erasing.current;
      erasing.current = null;
      if (er.changed) {
        const h = hist(key);
        h.past.push(er.before);
        h.future = [];
        setHistoryVersion((v) => v + 1);
      }
    } else if (drag.current) {
      const d = drag.current;
      drag.current = null;
      if (d.moved) {
        const h = hist(key);
        h.past.push(d.before);
        h.future = [];
        setHistoryVersion((v) => v + 1);
      }
    }
  };

  const onDrop = (e: DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      const entry = JSON.parse(e.dataTransfer.getData('application/x-board-icon')) as PaletteEntry;
      const [x, y] = point(e);
      placeIcon(entry, x, y);
    } catch {
      /* パレット以外からのドロップは無視 */
    }
  };

  // ---- ステージ画像の登録 ----

  const uploadMap = async (file: File) => {
    setMapBusy(true);
    try {
      const m = await import('../firebase/stageMaps');
      const data = await compressMap(file, m.MAX_MAP_CHARS - 1000);
      await m.saveStageMap(ui.stage, ui.rule, data);
      setMaps((x) => ({ ...x, [mapKey]: data }));
      showSnackbar(`${ui.stage}（${ui.rule}）の画像を登録しました`);
    } catch (e) {
      const code = (e as { code?: string }).code;
      showSnackbar(code === 'permission-denied' ? '登録する権限がありません（編集者のアカウントでログインしてください）' : `登録できませんでした（${e instanceof Error ? e.message : e}）`);
    } finally {
      setMapBusy(false);
    }
  };
  const removeMap = async () => {
    if (!confirm(`${ui.stage}（${ui.rule}）の画像を削除しますか？\n全員の作戦ボードから消えます。`)) return;
    try {
      const m = await import('../firebase/stageMaps');
      await m.deleteStageMap(ui.stage, ui.rule);
      setMaps((x) => ({ ...x, [mapKey]: null }));
    } catch (e) {
      showSnackbar(`削除できませんでした（${(e as { code?: string }).code ?? e}）`);
    }
  };

  // ---- 画像の保存 ----

  const phaseLabel = PHASES.find((p) => p.value === ui.phase)?.label ?? '';
  const exportCanvas = () => {
    const w = mapImg ? Math.max(1600, Math.min(2400, mapImg.naturalWidth)) : 1920;
    const h = Math.round(w / aspect);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const loaded = new Map([...icons.current].filter(([, img]) => img.complete && img.naturalWidth > 0));
    renderBoard(canvas.getContext('2d')!, w, h, mapImg, items, loaded);
    return canvas;
  };
  const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('画像を作れませんでした'))), 'image/png'));
  const save = async () => {
    const blob = await toBlob(exportCanvas());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `作戦ボード_${ui.stage}_${ui.rule}_${phaseLabel}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(exportCanvas()) })]);
      showSnackbar('画像をコピーしました。Discord にそのまま貼り付けできます');
    } catch {
      showSnackbar('このブラウザでは画像のコピーができません。「画像を保存」を使ってください');
    }
  };

  const list = useMemo(() => {
    const q = normalizeForSearch(query);
    return PALETTE[tab].filter((x) =>
      x.kind === 'weapon' ? matchesQuery(WEAPONS.find((w) => w.id === x.ref)!, query) : !q || normalizeForSearch(x.name).includes(q),
    );
  }, [tab, query]);

  const h = hist(key);
  const hint = pending ? `「${pending.name}」を置く場所をタップ` : TOOLS.find((t) => t.value === tool)?.hint;

  return (
    <div className="page board-page">
      <div className="page-header row">
        <h1 className="headline">作戦ボード</h1>
        <span className="spacer" />
        <button className="btn tonal" onClick={copy}>
          <Icon name="content_copy" />
          画像をコピー
        </button>
        <button className="btn filled" onClick={save}>
          <Icon name="download" />
          画像を保存
        </button>
      </div>

      <div className="board-top">
        <label className="field">
          <span className="field-label">ステージ</span>
          <select className="input" value={ui.stage} onChange={(e) => setUiPart({ stage: e.target.value })}>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">ルール</span>
          <select className="input" value={ui.rule} onChange={(e) => setUiPart({ rule: e.target.value as BoardRule })}>
            {BOARD_RULES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        {auth.isEditor && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) uploadMap(f);
              }}
            />
            <button className="btn text" disabled={mapBusy} onClick={() => fileRef.current?.click()}>
              <Icon name="add_photo_alternate" />
              {mapBusy ? '登録中…' : mapData ? 'ステージ画像を変更' : 'ステージ画像を登録'}
            </button>
            {mapData && <IconButton icon="delete" label="ステージ画像を削除" onClick={removeMap} />}
          </>
        )}
        <button className="btn text" onClick={clearAll} disabled={!items.length}>
          <Icon name="delete" />
          全消去
        </button>
      </div>

      <div className="board-layout">
        <div className="board-tools card">
          {TOOLS.map((t) => (
            <button
              key={t.value}
              className={`board-tool ${tool === t.value && !pending ? 'active' : ''}`}
              onClick={() => {
                setTool(t.value);
                setPending(null);
              }}
            >
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
          <div className="board-undo">
            <IconButton icon="undo" label="元に戻す（Ctrl+Z）" onClick={undo} disabled={!h.past.length} />
            <IconButton icon="redo" label="やり直す（Ctrl+Shift+Z）" onClick={redo} disabled={!h.future.length} />
          </div>
          {selectedId && (
            <button className="board-tool" onClick={removeSelected}>
              <Icon name="delete" />
              選択を削除
            </button>
          )}
          <span className="label">線の色</span>
          <div className="board-colors">
            {STROKE_COLORS.map((c) => (
              <button
                key={c}
                className={`board-color ${ui.color === c ? 'selected' : ''}`}
                style={{ background: c }}
                aria-label={`色 ${c}`}
                onClick={() => setUiPart({ color: c })}
              />
            ))}
            <label className={`board-color custom ${STROKE_COLORS.includes(ui.color) ? '' : 'selected'}`} title="ほかの色">
              <input type="color" value={ui.color} onChange={(e) => setUiPart({ color: e.target.value })} aria-label="ほかの色" />
              <Icon name="add" />
            </label>
          </div>
          <span className="label">太さ</span>
          <div className="board-widths">
            {STROKE_WIDTHS.map((w) => (
              <button key={w.value} className={`board-width ${ui.width === w.value ? 'selected' : ''}`} onClick={() => setUiPart({ width: w.value })} aria-label={`太さ ${w.label}`}>
                <span style={{ height: Math.max(2, w.value / 2) }} />
              </button>
            ))}
          </div>
        </div>

        <section className="card board-main">
          <div className="board-title">
            <Icon name="map" />
            <span className="title-m">{ui.stage}</span>
            <span className="spacer" />
            <span className="badge">{ui.rule}</span>
          </div>
          <div ref={wrapRef} className="board-canvas-wrap">
            <canvas
              ref={canvasRef}
              className={`board-canvas tool-${pending ? 'place' : tool}`}
              style={{ width: size.w, height: size.h }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            />
            {mapData === null && (
              <p className="board-empty">
                ステージ画像は未登録です{auth.isEditor ? '（右上から登録できます）' : ''}
              </p>
            )}
          </div>
          <p className="muted body-s board-hint">{hint}</p>
        </section>

        <section className="card board-palette">
          <h2 className="card-title">アイコン</h2>
          <div className="board-tabs" role="tablist">
            {PALETTE_TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={tab === t.value}
                className={tab === t.value ? 'active' : ''}
                onClick={() => {
                  setTab(t.value);
                  setQuery('');
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="search">
            <Icon name="search" />
            <input className="input" placeholder={PALETTE_TABS.find((t) => t.value === tab)!.placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <span className="muted body-s">{list.length} 件</span>
          <div className="board-icons">
            {list.map((x) => (
              <button
                key={x.ref}
                className={`board-icon ${pending?.ref === x.ref && pending.kind === x.kind ? 'selected' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-board-icon', JSON.stringify(x));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => setPending(pending?.ref === x.ref && pending.kind === x.kind ? null : x)}
                title={x.name}
              >
                <img src={x.url} alt="" loading="lazy" />
                <span>{x.name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="board-phases" role="tablist" aria-label="場面">
        {PHASES.map((p) => {
          const has = (boards[boardKey(ui.stage, ui.rule, p.value)] ?? []).length > 0;
          return (
            <button
              key={p.value}
              role="tab"
              aria-selected={ui.phase === p.value}
              className={`board-phase ${ui.phase === p.value ? 'active' : ''}`}
              onClick={() => {
                setUiPart({ phase: p.value });
                setSelectedId(null);
              }}
            >
              <Icon name={p.icon} />
              {p.label}
              {has && <span className="board-phase-dot" aria-label="描いた内容あり" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
