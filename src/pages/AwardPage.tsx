import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { AvatarInput } from '../components/AvatarInput';
import { PrizeVideos } from '../components/PrizeVideos';
import { Empty, Field, Icon, Segmented, Switch, TeamName, XBadge, showSnackbar } from '../components/ui';
import { CATEGORIES, categoryOf, weaponIconUrl } from '../data/weapons';
import { AWARD_BACKGROUNDS, AWARD_TEMPLATES, canvasToBlob, drawAward, type AwardBackground, type AwardData, type AwardTemplate } from '../lib/award';
import { DEFAULT_PHOTO, PHOTO_BANDS, drawPhotoAward, photoGeometry, type PhotoOptions } from '../lib/awardPhoto';
import { type MatchView } from '../lib/bracket';
import { allPlacements } from '../lib/league';
import { BRANDS, brandOf } from '../lib/brand';
import { kindOf } from '../lib/kinds';
import { allPicks, usageBy } from '../lib/records';
import { roster } from '../lib/roster';
import { teamUses } from '../lib/usage';
import { playerTitles } from '../lib/titles';
import { updatePlayer, useApp, usePlayers } from '../store';
import type { Team, Tournament } from '../types';


function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_') || 'award';
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** テンプレートに合わせて描き分ける (スクショは別の描画処理) */
function render(canvas: HTMLCanvasElement, d: AwardData, template: AwardTemplate, photo: PhotoOptions, isCurrent?: () => boolean) {
  return template === 'photo' ? drawPhotoAward(canvas, d, photo, isCurrent) : drawAward(canvas, d, template, isCurrent);
}

/** 画像ファイルを読み込む (スクリーンショットはブラウザの中だけで使い、保存しない) */
function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

const BG_KEY = 'by-splatoon:award-background';

/** 表彰画像の背景色 (端末ごとに前回の選択を覚える) */
function useStoredBackground(): [AwardBackground, (v: AwardBackground) => void] {
  const [value, setValue] = useState<AwardBackground>(() => {
    try {
      const v = localStorage.getItem(BG_KEY);
      return AWARD_BACKGROUNDS.some((b) => b.value === v) ? (v as AwardBackground) : 'default';
    } catch {
      return 'default';
    }
  });
  const set = (v: AwardBackground) => {
    setValue(v);
    try {
      localStorage.setItem(BG_KEY, v);
    } catch {
      /* 覚えられなくても選択はできる */
    }
  };
  return [value, set];
}

/** 大会後の表彰画像を、テンプレートにチームの情報を流し込んで作る */
export function AwardPage({ t, rounds }: { t: Tournament; rounds: MatchView[][] }) {
  const places = useMemo(() => allPlacements(t, rounds), [t, rounds]);
  const players = usePlayers();
  // 成績順 (未確定のチームはシード順で後ろ)
  const teams = useMemo(
    () =>
      t.teams
        .map((team, seed) => ({ team, seed, place: places.get(team.id) ?? null }))
        .sort((a, b) => (a.place?.rank ?? 999) - (b.place?.rank ?? 999) || a.seed - b.seed),
    [t.teams, places],
  );
  const [teamId, setTeamId] = useState(teams[0]?.team.id ?? '');
  const [template, setTemplate] = useState<AwardTemplate>('pop');
  const [title, setTitle] = useState('');
  const [showXp, setShowXp] = useState(true);
  const [background, setBackground] = useStoredBackground();
  const [showTitles, setShowTitles] = useState(true);
  const app = useApp();
  const [photo, setPhoto] = useState<PhotoOptions>({ ...DEFAULT_PHOTO, image: null });
  const photoFileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const isPhoto = template === 'photo';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawId = useRef(0);

  const selected = teams.find((x) => x.team.id === teamId) ?? teams[0];

  const buildData = (team: Team, customTitle: string): AwardData => {
    const place = places.get(team.id) ?? null;
    const counts = new Map<string, number>();
    if (kindOf(t).playerWeapons) {
      // 選手ごとの記録 (通常ルール) は、メンバーが使ったブキを使用回数の多い順に
      const mine = allPicks(t, rounds).filter((p) => p.teamId === team.id);
      for (const r of usageBy(mine, 'weapon')) counts.set(r.id, r.uses);
    } else {
      for (const u of teamUses(t, rounds, team.id)) counts.set(u.weaponId, (counts.get(u.weaponId) ?? 0) + 1);
    }
    // 背景の柄 (ブキ統一杯) に使うブキ: 使ったブキがあればそれ、なければ候補ブキ
    const useRecorded = !kindOf(t).hasPool || counts.size > 0;
    // 選手ごとの記録がある大会は、メンバーごとによく使ったブキ (使用率の高い順に 3 つ) を XP の下に並べる
    const topWeapons = new Map<string, string[]>();
    if (kindOf(t).playerWeapons) {
      const mine = allPicks(t, rounds).filter((p) => p.teamId === team.id);
      for (const { player } of roster(team, players)) {
        const top = usageBy(
          mine.filter((p) => p.playerId === player.id),
          'weapon',
        ).slice(0, 3);
        topWeapons.set(player.id, top.map((x) => weaponIconUrl(x.id)));
      }
    }
    const ids = useRecorded ? [...counts.keys()] : team.pool;
    return {
      tournament: t.name,
      date: t.date,
      title: customTitle || place?.label || '出場',
      rank: place?.rank ?? null,
      team: { name: team.name, color: team.color },
      members: roster(team, players).map(({ member: m, player: p }) => ({
        name: p.name,
        avatar: p.avatar,
        xp: p.xp,
        leader: m.leader,
        weapons: topWeapons.get(p.id),
        // 過去の戦績 (表示中の大会は数えない)
        titles: showTitles ? playerTitles(app, p, t.id) : undefined,
      })),
      // チームのブキ (表示はしない。ブキ統一杯の背景の柄に先頭のアイコンを使う)
      weapons: ids.map((id) => ({
        color: categoryOf(id)?.color ?? '#888888',
        icon: weaponIconUrl(id),
      })),
      showXp,
      background,
      kind: {
        label: kindOf(t).label,
        motif: t.rules.kind,
        colors: t.rules.categories.map((c) => CATEGORIES.find((x) => x.id === c)?.color ?? '#888888'),
      },
      logo: brandOf(t).image,
    };
  };

  // 入力が変わるたびにプレビューを描き直す
  useEffect(() => {
    if (!selected || !canvasRef.current) return;
    const id = ++drawId.current;
    render(canvasRef.current, buildData(selected.team, title), template, photo, () => id === drawId.current);
  });

  const setShot = async (file: Blob) => {
    try {
      const image = await fileToImage(file);
      setPhoto((p) => {
        if (p.image) URL.revokeObjectURL(p.image.src);
        return { ...p, image, zoom: 1, x: 0, y: 0 };
      });
    } catch (e) {
      showSnackbar(e instanceof Error ? e.message : '画像を読み込めませんでした');
    }
  };
  const pasteShot = (e: ReactClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    setShot(file);
  };

  // スクショのプレビューをドラッグして位置を調整する
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isPhoto || !photo.image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !photo.image) return;
    const ratio = e.currentTarget.width / e.currentTarget.clientWidth; // 画面上の 1px = キャンバスの何 px か
    const dx = (e.clientX - drag.current.x) * ratio;
    const dy = (e.clientY - drag.current.y) * ratio;
    drag.current = { x: e.clientX, y: e.clientY };
    const g = photoGeometry(photo.image, photo.zoom);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    setPhoto((p) => ({
      ...p,
      x: g.overflowX > 0 ? clamp(p.x - (2 * dx) / g.overflowX) : 0,
      y: g.overflowY > 0 ? clamp(p.y - (2 * dy) / g.overflowY) : 0,
    }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  if (!selected) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="headline">表彰</h1>
        </div>
        <Empty icon="emoji_events">チームを登録すると表彰画像を作れます</Empty>
        <PrizeVideos t={t} />
        <AwardTemplateGallery />
      </div>
    );
  }

  const fileName = (team: Team) => `${safeName(t.name)}_${safeName(places.get(team.id)?.label ?? '出場')}_${safeName(team.name)}.png`;

  const save = async () => {
    if (!canvasRef.current) return;
    download(await canvasToBlob(canvasRef.current), fileName(selected.team));
  };

  const copy = async () => {
    if (!canvasRef.current) return;
    try {
      const blob = canvasToBlob(canvasRef.current);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showSnackbar('画像をコピーしました。Discord にそのまま貼り付けできます');
    } catch {
      showSnackbar('このブラウザでは画像のコピーができません。「PNG を保存」を使ってください');
    }
  };

  const saveAll = async () => {
    const canvas = document.createElement('canvas');
    for (const { team } of teams) {
      await render(canvas, buildData(team, ''), template, photo);
      download(await canvasToBlob(canvas), fileName(team));
      await new Promise((r) => setTimeout(r, 300)); // 連続ダウンロードがブロックされないよう間隔をあける
    }
    showSnackbar(`${teams.length} チーム分の画像を保存しました`);
  };

  const editPlayerAvatar = (playerId: string, avatar: string) => updatePlayer(playerId, (p) => void (p.avatar = avatar));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="headline">表彰</h1>
        <p className="muted">
          テンプレートにチーム名・メンバー・使用ブキ・アイコンを流し込んで、表彰画像（1600×900 PNG）を作ります。
          「スクショ」では、任意のスクリーンショットに大会名やチームの帯を重ねた画像（1920×1080 PNG）を作れます。
        </p>
      </div>

      <div className="award-layout">
        <section className="card award-side">
          <h2 className="card-title">チーム</h2>
          <div className="nav-list" role="radiogroup">
            {teams.map(({ team, place }) => (
              <button
                key={team.id}
                role="radio"
                aria-checked={team.id === selected.team.id}
                className={`nav-list-item ${team.id === selected.team.id ? 'active' : ''}`}
                onClick={() => {
                  setTeamId(team.id);
                  setTitle('');
                }}
              >
                <TeamName name={team.name} color={team.color} />
                <span className="spacer" />
                <span className="overline">{place?.label ?? '未確定'}</span>
              </button>
            ))}
          </div>

          <span className="label">テンプレート</span>
          <Segmented value={template} onChange={setTemplate} options={AWARD_TEMPLATES} />
          {isPhoto && (
            <div className="photo-controls">
              <input
                ref={photoFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) setShot(f);
                }}
              />
              <div className="photo-drop" tabIndex={0} onPaste={pasteShot} onClick={() => photoFileRef.current?.click()} role="button">
                <Icon name="add_photo_alternate" />
                <span>
                  {photo.image ? 'スクリーンショットを変更' : 'スクリーンショットを選ぶ'}
                  <span className="muted body-s">クリックして選ぶか、ここを選択して Ctrl+V（⌘V）で貼り付け。画像は保存されません</span>
                </span>
              </div>
              {photo.image && (
                <label className="photo-zoom">
                  <span className="label">拡大</span>
                  <input
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={photo.zoom}
                    onChange={(e) => setPhoto((p) => ({ ...p, zoom: Number(e.target.value) }))}
                  />
                </label>
              )}
              {photo.image && <p className="muted body-s">プレビューをドラッグすると位置を調整できます。</p>}
              <Switch label="上部の帯（大会名・見出し）" checked={photo.top} onChange={(v) => setPhoto((p) => ({ ...p, top: v }))} />
              {photo.top && (
                <>
                  <span className="label">帯の色</span>
                  <div className="bg-swatches" role="radiogroup" aria-label="帯の色">
                    {PHOTO_BANDS.map((b) => (
                      <button
                        key={b.value}
                        type="button"
                        role="radio"
                        aria-checked={photo.band === b.value}
                        aria-label={b.label}
                        title={b.label}
                        className={`bg-swatch ${b.value === 'black' ? 'dark' : ''} ${photo.band === b.value ? 'selected' : ''}`}
                        style={{ background: b.color ?? selected.team.color }}
                        onClick={() => setPhoto((p) => ({ ...p, band: b.value }))}
                      >
                        {photo.band === b.value && <Icon name="check" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <Switch label="下部のパネル（チーム名・メンバー）" checked={photo.bottom} onChange={(v) => setPhoto((p) => ({ ...p, bottom: v }))} />
            </div>
          )}
          <Field label="見出し" hint="空欄なら成績（優勝・準優勝・ベスト4 など）">
            <input
              className="input"
              value={title}
              placeholder={places.get(selected.team.id)?.label ?? '出場'}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          {!isPhoto && (
            <>
              <span className="label">背景色</span>
              <div className="bg-swatches" role="radiogroup" aria-label="背景色">
                {AWARD_BACKGROUNDS.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    role="radio"
                    aria-checked={background === b.value}
                    aria-label={b.label}
                    title={b.label}
                    className={`bg-swatch ${b.color ? '' : 'auto'} ${b.dark ? 'dark' : ''} ${background === b.value ? 'selected' : ''}`}
                    style={b.color ? { background: b.color } : undefined}
                    onClick={() => setBackground(b.value)}
                  >
                    {background === b.value && <Icon name="check" />}
                  </button>
                ))}
              </div>
              <Switch label="Xパワーバッジを表示" checked={showXp} onChange={setShowXp} />
            </>
          )}
          <Switch label="戦績の星を表示（過去の優勝・準優勝）" checked={showTitles} onChange={setShowTitles} />
        </section>

        <div className="award-main">
          <section className="card">
            <canvas
              ref={canvasRef}
              className={`award-canvas ${isPhoto && photo.image ? 'draggable' : ''}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <div className="card-actions">
              {/* スクショは 1 枚の写真に合わせて作るので、全チーム分の一括保存はしない */}
              {!isPhoto && (
                <button className="btn text" onClick={saveAll}>
                  <Icon name="download" />
                  全チーム分を保存
                </button>
              )}
              <span className="spacer" />
              <button className="btn tonal" onClick={copy}>
                <Icon name="content_copy" />
                画像をコピー
              </button>
              <button className="btn filled" onClick={save}>
                <Icon name="image" />
                PNG を保存
              </button>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">メンバーのアイコン</h2>
            <p className="muted body-s">
              アイコンをクリックして画像を選ぶか、枠を選択して Ctrl+V（⌘V）で貼り付けます。Discord では
              プロフィールのアイコンを開き「画像をコピー」すると貼り付けられます。未設定のメンバーは名前の頭文字で表示します。
            </p>
            <div className="avatar-grid">
              {roster(selected.team, players).map(({ player: p }) => (
                <div key={p.id} className="avatar-cell">
                  <div className="avatar-cell-name">
                    <span className="title-m">{p.name || '(名前未入力)'}</span>
                    <XBadge xp={p.xp} withValue />
                  </div>
                  <AvatarInput name={p.name} color={selected.team.color} value={p.avatar} onChange={(v) => editPlayerAvatar(p.id, v)} />
                </div>
              ))}
              {selected.team.members.length === 0 && <Empty>メンバーが登録されていません</Empty>}
            </div>
          </section>
        </div>
      </div>

      <PrizeVideos t={t} />

      <AwardTemplateGallery selected={template} onSelect={setTemplate} />
    </div>
  );
}

// ---- テンプレート見本 (いつでも確認できるよう、例のデータで常に表示する) ----

const SAMPLE: Omit<AwardData, 'team'> = {
  tournament: '第1回 BYブキ統一杯（見本）',
  date: '2026/10/12',
  title: '優勝',
  rank: 1,
  members: [
    { name: 'イカスミ', avatar: '', xp: 3120, leader: false, titles: { gold: 3, silver: 1 } },
    { name: 'タコワサ', avatar: '', xp: 2810, leader: true, titles: { gold: 1, silver: 0 } },
    { name: 'ホタテ', avatar: '', xp: 2560, leader: false, titles: { gold: 0, silver: 2 } },
    { name: 'サザエ', avatar: '', xp: 2300, leader: false },
  ],
  weapons: ['Shooter_Normal_00', 'Brush_Normal_00', 'Charger_Long_00'].map((id) => ({
    color: categoryOf(id)?.color ?? '#888888',
    icon: weaponIconUrl(id),
  })),
  showXp: true,
  kind: { label: 'ブキ統一杯', motif: 'unified' },
  logo: BRANDS.league.image,
};

const SAMPLE_TEAMS: Record<AwardTemplate, { name: string; color: string }> = {
  pop: { name: 'チームイカ', color: '#f2e14c' },
  team: { name: 'チームタコ', color: '#7b5cff' },
  simple: { name: 'チームクマ', color: '#ff5c8a' },
  photo: { name: 'チームフグ', color: '#3fb7c9' },
};

/** 3 種類のテンプレートの見本。selected / onSelect を渡すと、クリックでそのテンプレートを選べる */
export function AwardTemplateGallery(props: { selected?: AwardTemplate; onSelect?: (t: AwardTemplate) => void }) {
  return (
    <section className="card">
      <h2 className="card-title">テンプレート見本</h2>
      <p className="muted body-s">
        名前・ブキは例です。実際の画像には、選んだチームのメンバー・アイコン・Xパワー・使用ブキが入ります。
        {props.onSelect && '見本をクリックすると、そのテンプレートに切り替わります。'}
      </p>
      <div className="template-gallery">
        {AWARD_TEMPLATES.map(({ value, label }) => (
          <TemplateSample
            key={value}
            template={value}
            label={label}
            selected={props.selected === value}
            onClick={props.onSelect ? () => props.onSelect!(value) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function TemplateSample(props: { template: AwardTemplate; label: string; selected: boolean; onClick?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // スクショの見本は写真なし (「スクリーンショットを選んでください」の案内) で帯とパネルだけを見せる
    if (ref.current) render(ref.current, { ...SAMPLE, team: SAMPLE_TEAMS[props.template] }, props.template, { ...DEFAULT_PHOTO, image: null });
  }, [props.template]);
  const body = (
    <>
      <canvas ref={ref} className="award-canvas" aria-label={`${props.label}テンプレートの見本`} />
      <span className="template-label">
        {props.selected && <Icon name="check" />}
        {props.label}
      </span>
    </>
  );
  return props.onClick ? (
    <button type="button" className={`template-sample ${props.selected ? 'selected' : ''}`} onClick={props.onClick} aria-pressed={props.selected}>
      {body}
    </button>
  ) : (
    <div className="template-sample">{body}</div>
  );
}
