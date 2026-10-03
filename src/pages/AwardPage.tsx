import { useEffect, useMemo, useRef, useState } from 'react';
import { AvatarInput } from '../components/AvatarInput';
import { Empty, Field, Icon, Segmented, Switch, TeamName, XBadge, showSnackbar } from '../components/ui';
import { categoryOf, weaponIconUrl, weaponName } from '../data/weapons';
import { AWARD_TEMPLATES, canvasToBlob, drawAward, type AwardData, type AwardTemplate } from '../lib/award';
import { type MatchView } from '../lib/bracket';
import { allPlacements } from '../lib/league';
import { kindOf } from '../lib/kinds';
import { allPicks, usageBy } from '../lib/records';
import { roster } from '../lib/roster';
import { teamUses } from '../lib/usage';
import { updatePlayer, usePlayers } from '../store';
import type { Team, Tournament } from '../types';

type WeaponSource = 'used' | 'pool';

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
  const [source, setSource] = useState<WeaponSource>('used');
  const [showXp, setShowXp] = useState(true);
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
    // 候補ブキのない大会 (通常ルール) は記録したブキだけ
    const useRecorded = !kindOf(t).hasPool || (source === 'used' && counts.size > 0);
    // 選手ごとの記録がある大会は、メンバーごとに一番使ったブキをアイコンに添える
    const topWeapon = new Map<string, string>();
    if (kindOf(t).playerWeapons) {
      const mine = allPicks(t, rounds).filter((p) => p.teamId === team.id);
      for (const { player } of roster(team, players)) {
        const top = usageBy(
          mine.filter((p) => p.playerId === player.id),
          'weapon',
        )[0];
        if (top) topWeapon.set(player.id, weaponIconUrl(top.id));
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
        weapon: topWeapon.get(p.id),
      })),
      weaponCaption: useRecorded ? '使用ブキ' : '候補ブキ',
      weapons: ids.map((id) => ({
        name: weaponName(id),
        color: categoryOf(id)?.color ?? '#888888',
        count: useRecorded ? (counts.get(id) ?? 0) : 0,
        icon: weaponIconUrl(id),
      })),
      showXp,
      kind: { label: kindOf(t).label, motif: t.rules.kind },
    };
  };

  // 入力が変わるたびにプレビューを描き直す
  useEffect(() => {
    if (!selected || !canvasRef.current) return;
    const id = ++drawId.current;
    drawAward(canvasRef.current, buildData(selected.team, title), template, () => id === drawId.current);
  });

  if (!selected) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="headline">表彰</h1>
        </div>
        <Empty icon="emoji_events">チームを登録すると表彰画像を作れます</Empty>
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
      await drawAward(canvas, buildData(team, ''), template);
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
        <p className="muted">テンプレートにチーム名・メンバー・使用ブキ・アイコンを流し込んで、表彰画像（1600×900 PNG）を作ります。</p>
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
          {kindOf(t).hasPool && (
            <>
              <span className="label">ブキの表示</span>
              <Segmented
                value={source}
                onChange={setSource}
                options={[
                  { value: 'used', label: '使用ブキ' },
                  { value: 'pool', label: '候補ブキ' },
                ]}
              />
            </>
          )}
          <Field label="見出し" hint="空欄なら成績（優勝・準優勝・ベスト4 など）">
            <input
              className="input"
              value={title}
              placeholder={places.get(selected.team.id)?.label ?? '出場'}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Switch label="Xパワーバッジを表示" checked={showXp} onChange={setShowXp} />
        </section>

        <div className="award-main">
          <section className="card">
            <canvas ref={canvasRef} className="award-canvas" />
            <div className="card-actions">
              <button className="btn text" onClick={saveAll}>
                <Icon name="download" />
                全チーム分を保存
              </button>
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
    { name: 'イカスミ', avatar: '', xp: 3120, leader: false },
    { name: 'タコワサ', avatar: '', xp: 2810, leader: true },
    { name: 'ホタテ', avatar: '', xp: 2560, leader: false },
    { name: 'サザエ', avatar: '', xp: 2300, leader: false },
  ],
  weaponCaption: '使用ブキ',
  weapons: [
    ['Shooter_Normal_00', 3],
    ['Brush_Normal_00', 2],
    ['Charger_Long_00', 1],
  ].map(([id, count]) => ({
    name: weaponName(id as string),
    color: categoryOf(id as string)?.color ?? '#888888',
    count: count as number,
    icon: weaponIconUrl(id as string),
  })),
  showXp: true,
  kind: { label: 'ブキ統一杯', motif: 'unified' },
};

const SAMPLE_TEAMS: Record<AwardTemplate, { name: string; color: string }> = {
  pop: { name: 'チームイカ', color: '#f2e14c' },
  team: { name: 'チームタコ', color: '#7b5cff' },
  simple: { name: 'チームクマ', color: '#ff5c8a' },
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
    if (ref.current) drawAward(ref.current, { ...SAMPLE, team: SAMPLE_TEAMS[props.template] }, props.template);
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
