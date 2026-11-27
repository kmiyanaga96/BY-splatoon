import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useAuthView } from '../backend';
import { Icon, IconButton, showSnackbar } from '../components/ui';
import stages from '../data/stages.json';
import subspe from '../data/subspe.json';
import { WEAPONS, matchesQuery, normalizeForSearch, weaponIconUrl } from '../data/weapons';
import {
  BOARD_RULES,
  DEFAULT_ASPECT,
  LABEL_MAX,
  MAX_SLIDES,
  MEMO_MAX,
  STROKE_COLORS,
  STROKE_WIDTHS,
  TEAMS,
  TEXT_SIZES,
  copyTokens,
  defaultPlan,
  hitTest,
  migrateBoards,
  moveItem,
  parsePlans,
  planKey,
  renderBoard,
  renderSheet,
  sheetLayout,
  teamColor,
  type BoardItem,
  type BoardRule,
  type IconKind,
  type Plan,
  type Slide,
  type StrokeItem,
  type Team,
  type TextItem,
} from '../lib/board';

type Tool = 'select' | 'pen' | 'arrow' | 'line' | 'text' | 'eraser';

const TOOLS: { value: Tool; label: string; icon: string; hint: string }[] = [
  { value: 'select', label: '選択', icon: 'arrow_selector_tool', hint: 'ドラッグで移動、ダブルクリックで文字を編集、Delete キーで削除' },
  { value: 'pen', label: 'ペン', icon: 'edit', hint: 'ドラッグで線を描画' },
  { value: 'arrow', label: '矢印', icon: 'north_east', hint: 'ドラッグで矢印を描画' },
  { value: 'line', label: '直線矢印', icon: 'trending_flat', hint: 'ドラッグでまっすぐな矢印を描画' },
  { value: 'text', label: '文字', icon: 'title', hint: '文字を置く場所をクリック' },
  { value: 'eraser', label: '消しゴム', icon: 'ink_eraser', hint: 'なぞったものを消す' },
];

const PLANS_KEY = 'by-splatoon:plans';
/** 以前の保存形式 (場面ごと)。読み込んだら作戦の形に直す */
const OLD_BOARDS_KEY = 'by-splatoon:boards';
const UI_KEY = 'by-splatoon:board-ui';

interface UiState {
  stage: string;
  rule: BoardRule;
  slide: number;
  color: string;
  width: number;
  dashed: boolean;
  team: Team;
  textSize: number;
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

function loadPlans(): Record<string, Plan> {
  const plans = parsePlans(readJson(PLANS_KEY, null));
  if (Object.keys(plans).length) return plans;
  return migrateBoards(readJson(OLD_BOARDS_KEY, null));
}

const newId = () => Math.random().toString(36).slice(2, 10);
const subspeUrl = (id: string) => `${import.meta.env.BASE_URL}subspe/${id}.png`;
const iconUrl = (kind: IconKind, ref: string) => (kind === 'weapon' ? weaponIconUrl(ref) : subspeUrl(ref));
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_');

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('画像を読み込めませんでした'));
    i.src = src;
  });
}

/** 画像ファイルを、Firestore に入る大きさ (1MB 未満) の JPEG の data URL にする */
async function compressMap(file: Blob, maxChars: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
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

interface TextEdit {
  /** 編集中の文字 (新しく置くときは null) */
  id: string | null;
  x: number;
  y: number;
  value: string;
}

/**
 * 作戦ボード (ツールモード)。ステージ × ルールの画像の上に、ブキ・サブ・スペシャルのアイコンや線・矢印・文字を描いて画像に保存する。
 * 1 つの作戦は複数のコマ (初動・抑え・打開など) からなる。
 * ステージ画像は編集者が登録して全員で共有する。貼り付けたスクショはその場限り。描いた内容はこの端末にだけ保存する
 */
export function BoardPage() {
  const auth = useAuthView();
  const [ui, setUi] = useState<UiState>(() => {
    const saved = readJson<Partial<UiState>>(UI_KEY, {});
    return {
      stage: stages.includes(saved.stage ?? '') ? saved.stage! : stages[0],
      rule: BOARD_RULES.includes(saved.rule as BoardRule) ? (saved.rule as BoardRule) : 'エリア',
      slide: typeof saved.slide === 'number' ? saved.slide : 0,
      color: saved.color ?? STROKE_COLORS[0],
      width: saved.width ?? 6,
      dashed: saved.dashed ?? false,
      team: saved.team === 'enemy' ? 'enemy' : 'ally',
      textSize: TEXT_SIZES.includes(saved.textSize ?? 0) ? saved.textSize! : TEXT_SIZES[1],
    };
  });
  const setUiPart = (patch: Partial<UiState>) => setUi((u) => ({ ...u, ...patch }));
  const [plans, setPlans] = useState<Record<string, Plan>>(loadPlans);
  const [tool, setTool] = useState<Tool>('arrow');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PaletteEntry | null>(null);
  const [tab, setTab] = useState<IconKind>('weapon');
  const [query, setQuery] = useState('');
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  // ステージ画像 ("ルール:ステージ" → data URL / null = 未登録 / undefined = 読み込み中)
  const [maps, setMaps] = useState<Record<string, string | null>>({});
  const [mapImg, setMapImg] = useState<HTMLImageElement | null>(null);
  // 貼り付けたスクショ (保存しない)
  const [pasted, setPasted] = useState<{ img: HTMLImageElement; blob: Blob } | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [, setIconsLoaded] = useState(0);
  const [, setHistoryVersion] = useState(0);

  const pk = planKey(ui.stage, ui.rule);
  const plan = plans[pk] ?? defaultPlan();
  const slideIdx = Math.min(ui.slide, plan.slides.length - 1);
  const slide = plan.slides[slideIdx];
  const items = slide.items;
  const histKey = `${pk}|${slide.id}`;
  const mapKey = `${ui.rule}:${ui.stage}`;
  const mapData = maps[mapKey];
  const bg = pasted?.img ?? mapImg;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  const icons = useRef(new Map<string, HTMLImageElement>());
  const history = useRef(new Map<string, { past: BoardItem[][]; future: BoardItem[][] }>());
  const draft = useRef<StrokeItem | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; before: BoardItem[]; moved: boolean } | null>(null);
  const erasing = useRef<{ before: BoardItem[]; changed: boolean } | null>(null);

  // 設定・作戦はこの端末に保存する
  useEffect(() => writeJson(UI_KEY, ui), [ui]);
  useEffect(() => {
    const t = window.setTimeout(() => writeJson(PLANS_KEY, plans), 300);
    return () => window.clearTimeout(t);
  }, [plans]);

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
    let alive = true;
    loadImage(mapData).then((img) => alive && setMapImg(img), () => {});
    return () => {
      alive = false;
    };
  }, [mapData]);

  const aspect = bg ? bg.naturalWidth / bg.naturalHeight : DEFAULT_ASPECT;

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
  const loadedIcons = () => new Map([...icons.current].filter(([, img]) => img.complete && img.naturalWidth > 0));

  // 描き直し (文字の編集中は、その文字を隠す)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of plan.slides) for (const it of s.items) if (it.type === 'icon') iconImage(it.kind, it.ref);
    const shown = items.filter((it) => it.id !== textEdit?.id);
    renderBoard(ctx, size.w, size.h, bg, draft.current ? [...shown, draft.current] : shown, loadedIcons(), selectedId);
  });

  // ---- 作戦・コマの変更 ----

  const updatePlan = (fn: (p: Plan) => Plan) => setPlans((all) => ({ ...all, [pk]: fn(all[pk] ?? defaultPlan()) }));
  const setItems = (fn: (items: BoardItem[]) => BoardItem[]) =>
    updatePlan((p) => ({ ...p, slides: p.slides.map((s) => (s.id === slide.id ? { ...s, items: fn(s.items) } : s)) }));
  const updateSlide = (patch: Partial<Slide>) => updatePlan((p) => ({ ...p, slides: p.slides.map((s) => (s.id === slide.id ? { ...s, ...patch } : s)) }));

  const hist = (k: string) => {
    if (!history.current.has(k)) history.current.set(k, { past: [], future: [] });
    return history.current.get(k)!;
  };
  const record = (before: BoardItem[]) => {
    const h = hist(histKey);
    h.past.push(before);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    setHistoryVersion((v) => v + 1);
  };
  /** 取り消せる変更として反映する */
  const commit = (next: BoardItem[]) => {
    record(items);
    setItems(() => next);
  };
  const undo = () => {
    const h = hist(histKey);
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(items);
    setItems(() => prev);
    setSelectedId(null);
    setHistoryVersion((v) => v + 1);
  };
  const redo = () => {
    const h = hist(histKey);
    const next = h.future.pop();
    if (!next) return;
    h.past.push(items);
    setItems(() => next);
    setHistoryVersion((v) => v + 1);
  };
  const removeSelected = () => {
    if (!selectedId) return;
    commit(items.filter((x) => x.id !== selectedId));
    setSelectedId(null);
  };
  const updateSelected = (patch: Partial<BoardItem>) => {
    commit(items.map((it) => (it.id === selectedId ? ({ ...it, ...patch } as BoardItem) : it)));
  };
  const clearAll = () => {
    if (!items.length || !confirm(`「${slide.label}」のコマをすべて消しますか？`)) return;
    commit([]);
    setSelectedId(null);
  };

  const goSlide = (i: number) => {
    setUiPart({ slide: i });
    setSelectedId(null);
    setTextEdit(null);
  };
  const addSlide = () => {
    if (plan.slides.length >= MAX_SLIDES) return;
    updatePlan((p) => ({ ...p, slides: [...p.slides, { id: newId(), label: `コマ${p.slides.length + 1}`, memo: '', items: [] }] }));
    goSlide(plan.slides.length);
  };
  const renameSlide = () => {
    const label = prompt('コマの名前', slide.label)?.trim();
    if (label) updateSlide({ label: label.slice(0, 12) });
  };
  const removeSlide = () => {
    if (plan.slides.length <= 1) return;
    if ((items.length || slide.memo) && !confirm(`「${slide.label}」のコマを削除しますか？`)) return;
    updatePlan((p) => ({ ...p, slides: p.slides.filter((s) => s.id !== slide.id) }));
    goSlide(Math.max(0, slideIdx - 1));
  };
  const copyFromPrev = () => {
    if (slideIdx === 0) return;
    commit(copyTokens(plan.slides[slideIdx - 1].items, items, newId));
    showSnackbar(`「${plan.slides[slideIdx - 1].label}」のブキの配置を写しました`);
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

  // ---- 貼り付けたスクショを背景にする (保存しない) ----

  const applyPasted = async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      setPasted({ img, blob });
      showSnackbar('貼り付けた画像を背景にしました（保存はされません）');
    } catch {
      URL.revokeObjectURL(url);
      showSnackbar('画像を読み込めませんでした');
    }
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      applyPasted(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  const clearPasted = () => {
    if (pasted) URL.revokeObjectURL(pasted.img.src);
    setPasted(null);
  };

  // ---- マウス・タッチ ----

  const point = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const placeIcon = (entry: PaletteEntry, x: number, y: number) => {
    const it: BoardItem = { type: 'icon', id: newId(), kind: entry.kind, ref: entry.ref, color: teamColor(ui.team), team: ui.team, x, y };
    commit([...items, it]);
    setSelectedId(it.id);
  };

  const eraseAt = (x: number, y: number) => {
    const hit = hitTest(items, x, y, size.w, size.h);
    if (!hit || !erasing.current) return;
    erasing.current.changed = true;
    setItems((list) => list.filter((it) => it.id !== hit.id));
  };

  const commitText = () => {
    const ed = textEdit;
    if (!ed) return;
    setTextEdit(null);
    const text = ed.value.trim().slice(0, 40);
    if (ed.id) {
      const before = items.find((it) => it.id === ed.id) as TextItem | undefined;
      if (!before || before.text === text) return;
      commit(text ? items.map((it) => (it.id === ed.id ? { ...before, text } : it)) : items.filter((it) => it.id !== ed.id));
    } else if (text) {
      const it: TextItem = { type: 'text', id: newId(), text, color: ui.color, size: ui.textSize, x: ed.x, y: ed.y };
      commit([...items, it]);
      setSelectedId(it.id);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const [x, y] = point(e);
    if (textEdit) {
      commitText();
      return;
    }
    if (pending) {
      placeIcon(pending, x, y);
      setPending(null);
      return;
    }
    if (tool === 'text') {
      // 既定の動作 (クリックでのフォーカス移動) を止めないと、出した入力欄がすぐ閉じてしまう
      e.preventDefault();
      const hit = hitTest(items, x, y, size.w, size.h);
      if (hit?.type === 'text') setTextEdit({ id: hit.id, x: hit.x, y: hit.y, value: hit.text });
      else setTextEdit({ id: null, x, y, value: '' });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'pen' || tool === 'arrow' || tool === 'line') {
      draft.current = { type: 'stroke', id: newId(), color: ui.color, width: ui.width, arrow: tool !== 'pen', points: [[x, y]] };
      if (ui.dashed) draft.current.dashed = true;
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
      const d = draft.current;
      if (tool === 'line') {
        draft.current = { ...d, points: [d.points[0], [x, y]] };
        setHistoryVersion((v) => v + 1);
        return;
      }
      const last = d.points[d.points.length - 1];
      // 2px 以上動いたときだけ点を足す
      if (Math.hypot((x - last[0]) * size.w, (y - last[1]) * size.h) >= 2) {
        draft.current = { ...d, points: [...d.points, [x, y]] };
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
      setItems((list) => list.map((it) => (it.id === d.id ? moveItem(it, dx, dy) : it)));
    }
  };

  const onPointerUp = () => {
    if (draft.current) {
      const s = draft.current;
      draft.current = null;
      const [a, b] = [s.points[0], s.points[s.points.length - 1]];
      const len = Math.hypot((b[0] - a[0]) * size.w, (b[1] - a[1]) * size.h);
      // 矢印はある程度の長さがあるときだけ (タップだけでは描かない)
      if (!s.arrow || (s.points.length > 1 && len > 6)) commit([...items, s]);
      else setHistoryVersion((v) => v + 1);
    } else if (erasing.current) {
      const er = erasing.current;
      erasing.current = null;
      if (er.changed) record(er.before);
    } else if (drag.current) {
      const d = drag.current;
      drag.current = null;
      if (d.moved) record(d.before);
    }
  };

  const onDoubleClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const [x, y] = point(e);
    const hit = hitTest(items, x, y, size.w, size.h);
    if (hit?.type !== 'text') return;
    e.preventDefault();
    setSelectedId(hit.id);
    setTextEdit({ id: hit.id, x: hit.x, y: hit.y, value: hit.text });
  };

  const onDrop = (e: DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) {
      applyPasted(file);
      return;
    }
    try {
      const entry = JSON.parse(e.dataTransfer.getData('application/x-board-icon')) as PaletteEntry;
      const [x, y] = point(e);
      placeIcon(entry, x, y);
    } catch {
      /* パレット以外からのドロップは無視 */
    }
  };

  // ---- ステージ画像の登録 ----

  const uploadMap = async (file: Blob) => {
    setMapBusy(true);
    try {
      const m = await import('../firebase/stageMaps');
      const data = await compressMap(file, m.MAX_MAP_CHARS - 1000);
      await m.saveStageMap(ui.stage, ui.rule, data);
      setMaps((x) => ({ ...x, [mapKey]: data }));
      clearPasted();
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

  // ---- 画像の保存・コピー ----

  /** all: 全コマを横に並べた 1 枚 */
  const exportCanvas = (all: boolean) => {
    const slides = all ? plan.slides : [slide];
    const base = bg ? Math.max(1200, Math.min(2000, bg.naturalWidth)) : 1600;
    // 横に並べるときは全体の幅が 5000px 程度に収まるようにする
    const boardW = all ? Math.min(base, Math.round(5000 / slides.length)) : base;
    const L = sheetLayout(slides, boardW, aspect, true);
    const canvas = document.createElement('canvas');
    canvas.width = L.width;
    canvas.height = L.height;
    renderSheet(canvas.getContext('2d')!, L, slides, bg, loadedIcons(), `${ui.stage}　${ui.rule}`);
    return canvas;
  };
  const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('画像を作れませんでした'))), 'image/png'));
  const save = async (all: boolean) => {
    const blob = await toBlob(exportCanvas(all));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeName(`作戦ボード_${ui.stage}_${ui.rule}_${all ? '全コマ' : slide.label}.png`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = async (all: boolean) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(exportCanvas(all)) })]);
      showSnackbar('画像をコピーしました。Discord にそのまま貼り付けできます');
    } catch {
      showSnackbar('このブラウザでは画像のコピーができません。保存を使ってください');
    }
  };

  const list = useMemo(() => {
    const q = normalizeForSearch(query);
    return PALETTE[tab].filter((x) =>
      x.kind === 'weapon' ? matchesQuery(WEAPONS.find((w) => w.id === x.ref)!, query) : !q || normalizeForSearch(x.name).includes(q),
    );
  }, [tab, query]);

  const h = hist(histKey);
  const hint = pending ? `「${pending.name}」を置く場所をクリック` : TOOLS.find((t) => t.value === tool)?.hint;
  const selected = items.find((it) => it.id === selectedId);
  const multi = plan.slides.length > 1;

  return (
    <div className="page board-page">
      <div className="page-header row">
        <h1 className="headline">作戦ボード</h1>
        <span className="spacer" />
        <button className="btn tonal" onClick={() => copy(false)}>
          <Icon name="content_copy" />
          コピー
        </button>
        {multi && (
          <button className="btn tonal" onClick={() => copy(true)} title="全コマを横に並べた 1 枚の画像">
            <Icon name="view_column" />
            全コマをコピー
          </button>
        )}
        <button className="btn filled" onClick={() => save(false)}>
          <Icon name="download" />
          保存
        </button>
        {multi && <IconButton icon="download" label="全コマを 1 枚で保存" onClick={() => save(true)} />}
      </div>

      <div className="board-top">
        <label className="field">
          <span className="field-label">ステージ</span>
          <select className="input" value={ui.stage} onChange={(e) => setUiPart({ stage: e.target.value, slide: 0 })}>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">ルール</span>
          <select className="input" value={ui.rule} onChange={(e) => setUiPart({ rule: e.target.value as BoardRule, slide: 0 })}>
            {BOARD_RULES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        {pasted ? (
          <>
            <span className="chip-note">
              <Icon name="content_paste" />
              貼り付けた画像
            </span>
            {auth.isEditor && (
              <button className="btn text" disabled={mapBusy} onClick={() => uploadMap(pasted.blob)}>
                <Icon name="add_photo_alternate" />
                {mapBusy ? '登録中…' : 'ステージ画像として登録'}
              </button>
            )}
            <button className="btn text" onClick={clearPasted}>
              <Icon name="close" />
              ステージ画像に戻す
            </button>
          </>
        ) : (
          auth.isEditor && (
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
          )
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
                commitText();
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

          {selected && (
            <div className="board-selected">
              <span className="label">選択中</span>
              {selected.type === 'icon' && (
                <>
                  <div className="board-seg">
                    {TEAMS.map((t) => (
                      <button key={t.value} className={selected.team === t.value ? 'active' : ''} style={{ '--team': t.color } as CSSProperties} onClick={() => updateSelected({ team: t.value, color: t.color })}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <input
                    key={selected.id}
                    className="input board-label-input"
                    placeholder="ラベル（名前・番号）"
                    maxLength={LABEL_MAX}
                    defaultValue={selected.label ?? ''}
                    onBlur={(e) => {
                      const label = e.target.value.trim();
                      if (label !== (selected.label ?? '')) updateSelected({ label: label || undefined });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                </>
              )}
              {selected.type === 'text' && (
                <button className="board-tool" onClick={() => setTextEdit({ id: selected.id, x: selected.x, y: selected.y, value: selected.text })}>
                  <Icon name="edit" />
                  文字を編集
                </button>
              )}
              <button className="board-tool" onClick={removeSelected}>
                <Icon name="delete" />
                削除
              </button>
            </div>
          )}

          <span className="label">置くアイコン</span>
          <div className="board-seg">
            {TEAMS.map((t) => (
              <button key={t.value} className={ui.team === t.value ? 'active' : ''} style={{ '--team': t.color } as CSSProperties} onClick={() => setUiPart({ team: t.value })}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="label">色</span>
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
          {tool === 'text' ? (
            <>
              <span className="label">文字の大きさ</span>
              <div className="board-widths">
                {TEXT_SIZES.map((s, i) => (
                  <button key={s} className={`board-width ${ui.textSize === s ? 'selected' : ''}`} onClick={() => setUiPart({ textSize: s })}>
                    {['小', '中', '大'][i]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <span className="label">線</span>
              <div className="board-widths">
                {STROKE_WIDTHS.map((w) => (
                  <button key={w.value} className={`board-width ${ui.width === w.value ? 'selected' : ''}`} onClick={() => setUiPart({ width: w.value })} aria-label={`太さ ${w.label}`}>
                    <span style={{ height: Math.max(2, w.value / 2) }} />
                  </button>
                ))}
              </div>
              <div className="board-widths">
                <button className={`board-width ${!ui.dashed ? 'selected' : ''}`} onClick={() => setUiPart({ dashed: false })} aria-label="実線">
                  <span style={{ height: 3 }} />
                </button>
                <button className={`board-width dashed ${ui.dashed ? 'selected' : ''}`} onClick={() => setUiPart({ dashed: true })} aria-label="破線">
                  <span style={{ height: 3 }} />
                </button>
              </div>
            </>
          )}
        </div>

        <section className="card board-main">
          <div className="board-slides" role="tablist" aria-label="コマ">
            {plan.slides.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={i === slideIdx}
                className={`board-slide ${i === slideIdx ? 'active' : ''}`}
                onClick={() => goSlide(i)}
                onDoubleClick={renameSlide}
                title="ダブルクリックで名前を変更"
              >
                <span className="board-slide-no">{i + 1}</span>
                {s.label}
                {s.items.length > 0 && <span className="board-slide-dot" aria-label="描いた内容あり" />}
              </button>
            ))}
            {plan.slides.length < MAX_SLIDES && <IconButton icon="add" label="コマを追加" onClick={addSlide} />}
            <span className="spacer" />
            <IconButton icon="edit" label="コマの名前を変更" onClick={renameSlide} />
            {slideIdx > 0 && <IconButton icon="content_copy" label="前のコマのブキの配置を写す" onClick={copyFromPrev} />}
            {plan.slides.length > 1 && <IconButton icon="delete" label="このコマを削除" onClick={removeSlide} />}
          </div>
          <div ref={wrapRef} className="board-canvas-wrap">
            <div className="board-canvas-box" style={{ width: size.w, height: size.h }}>
              <canvas
                ref={canvasRef}
                className={`board-canvas tool-${pending ? 'place' : tool}`}
                style={{ width: size.w, height: size.h }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={onDoubleClick}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
              />
              {textEdit && (
                <input
                  autoFocus
                  className="board-text-input"
                  style={{
                    left: textEdit.x * size.w,
                    top: textEdit.y * size.h,
                    color: (items.find((it) => it.id === textEdit.id) as TextItem | undefined)?.color ?? ui.color,
                  }}
                  maxLength={40}
                  value={textEdit.value}
                  placeholder="文字を入力"
                  onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                  onBlur={commitText}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitText();
                    if (e.key === 'Escape') setTextEdit(null);
                  }}
                />
              )}
            </div>
            {mapData === null && !pasted && (
              <p className="board-empty">
                ステージ画像は未登録です{auth.isEditor ? '（右上から登録できます）' : ''}。スクショを Ctrl+V で貼り付けても使えます
              </p>
            )}
          </div>
          <input
            className="input board-memo"
            placeholder={`「${slide.label}」のメモ（画像の下に入ります）`}
            maxLength={MEMO_MAX}
            value={slide.memo}
            onChange={(e) => updateSlide({ memo: e.target.value })}
          />
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
    </div>
  );
}
