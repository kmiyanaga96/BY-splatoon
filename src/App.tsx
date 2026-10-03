import { useEffect, useMemo, useState } from 'react';
import { signIn, signOut, useAuthView } from './backend';
import { Avatar, Icon, IconButton, SnackbarHost } from './components/ui';
import { computeBracket } from './lib/bracket';
import { kindOf } from './lib/kinds';
import { AnnouncePage } from './pages/AnnouncePage';
import { AwardPage, AwardTemplateGallery } from './pages/AwardPage';
import { BracketPage } from './pages/BracketPage';
import { HomePage } from './pages/HomePage';
import { PlayersPage } from './pages/PlayersPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
import { TeamsPage } from './pages/TeamsPage';
import { WeaponsPage } from './pages/WeaponsPage';
import { useRoute } from './router';
import { createTournament, selectTournament, useApp, useCanEdit, useCurrent, useSaveError, useStorageStatus } from './store';

const NAV: { path: string; label: string; icon: string; poolOnly?: boolean }[] = [
  { path: '', label: 'ホーム', icon: 'home' },
  { path: 'teams', label: 'チーム', icon: 'groups' },
  { path: 'players', label: '選手', icon: 'person' },
  // ブキ表は候補ブキを登録する大会 (ブキ統一杯) だけ
  { path: 'weapons', label: 'ブキ表', icon: 'table_view', poolOnly: true },
  { path: 'bracket', label: 'トーナメント', icon: 'account_tree' },
  { path: 'announce', label: '告知', icon: 'campaign' },
  { path: 'award', label: '表彰', icon: 'emoji_events' },
  { path: 'settings', label: '設定', icon: 'settings' },
];

const NEW = '__new__';

const SHARE_KEY = 'by-splatoon:share-mode';

/** 画面共有モード: Discord の配信越しでも読めるよう文字を大きくする (この端末だけの設定) */
function useShareMode(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SHARE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('share-mode', on);
    try {
      localStorage.setItem(SHARE_KEY, on ? '1' : '0');
    } catch {
      /* 保存できなくても表示は切り替わる */
    }
  }, [on]);
  return [on, setOn];
}

export function App() {
  const app = useApp();
  const t = useCurrent();
  const route = useRoute();
  const saveError = useSaveError();
  const [shareMode, setShareMode] = useShareMode();
  const authView = useAuthView();
  const storageStatus = useStorageStatus();
  const rounds = useMemo(() => (t ? computeBracket(t) : []), [t]);
  const [page, sub] = route;
  const current = page ?? '';

  let content;
  if (!t) {
    // 大会がまだ 1 つもない (選手 DB と表彰テンプレートの見本だけは見られる)
    content =
      page === 'players' ? (
        <PlayersPage playerId={sub} />
      ) : (
        <div className="page">
          <NoTournament />
          {page === 'award' && <AwardTemplateGallery />}
        </div>
      );
  } else switch (page) {
    case 'teams':
      content = sub ? <TeamDetailPage t={t} teamId={sub} rounds={rounds} /> : <TeamsPage t={t} rounds={rounds} />;
      break;
    case 'players':
      content = <PlayersPage playerId={sub} />;
      break;
    case 'weapons':
      content = kindOf(t).hasPool ? <WeaponsPage t={t} rounds={rounds} /> : <HomePage t={t} rounds={rounds} />;
      break;
    case 'bracket':
      content = <BracketPage t={t} rounds={rounds} />;
      break;
    case 'announce':
      content = <AnnouncePage t={t} rounds={rounds} />;
      break;
    case 'award':
      content = <AwardPage t={t} rounds={rounds} />;
      break;
    case 'settings':
      content = <SettingsPage t={t} />;
      break;
    default:
      content = <HomePage t={t} rounds={rounds} />;
  }

  const navItems = NAV.filter((n) => !n.poolOnly || !t || kindOf(t).hasPool).map((n) => {
    const active = current === n.path;
    return (
      <a key={n.path} href={`#/${n.path}`} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
        <span className="nav-indicator">
          <Icon name={n.icon} filled={active} />
        </span>
        <span className="nav-label">{n.label}</span>
      </a>
    );
  });

  return (
    <div className="app">
      <nav className="nav-rail" aria-label="メニュー">
        <a href="#/" className="rail-brand" aria-label="ホーム">
          BY
        </a>
        {navItems}
      </nav>
      <div className="app-body">
        <header className="top-app-bar">
          <span className="app-title">
            <span className="app-title-mark">BY</span>
            <span className="app-title-text">スプラ大会ツール</span>
          </span>
          <span className="spacer" />
          {t && (
            <div className="select-wrap">
              <select
                className="input tournament-select"
                value={t.id}
                onChange={(e) => (e.target.value === NEW ? createTournament() : selectTournament(e.target.value))}
                aria-label="表示する大会"
              >
                {[...app.tournaments].reverse().map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.date ? `（${x.date}）` : ''}
                  </option>
                ))}
                <option value={NEW}>＋ 新しい大会を作成…</option>
              </select>
            </div>
          )}
          <IconButton
            icon="present_to_all"
            label={shareMode ? '画面共有モードを終了' : '画面共有モード（文字を大きく）'}
            selected={shareMode}
            onClick={() => setShareMode(!shareMode)}
          />
          <AccountButton />
        </header>
        {authView.status !== 'loading' && !authView.isEditor && (
          <div className="banner info">
            <Icon name="visibility" />
            {authView.status === 'signedIn'
              ? `閲覧モード：${authView.email} には編集権限がありません。`
              : '閲覧モード：編集するには右上の「ログイン」から編集者の Google アカウントでログインしてください。'}
          </div>
        )}
        {saveError && (
          <div className="banner error">
            <Icon name="warning" />
            ブラウザへの保存に失敗しました。設定ページからデータを書き出して保管してください。({saveError})
          </div>
        )}
        <main className="main">
          {storageStatus === 'loading' ? (
            <div className="loading" role="status">
              <span className="spinner" />
              データを読み込んでいます…
            </div>
          ) : (
            content
          )}
        </main>
      </div>
      <nav className="nav-bar" aria-label="メニュー">
        {navItems}
      </nav>
      <SnackbarHost />
    </div>
  );
}

function AccountButton() {
  const a = useAuthView();
  if (a.status === 'loading') return null;
  if (a.status !== 'signedIn') {
    return (
      <button className="btn tonal" onClick={signIn}>
        <Icon name="login" />
        ログイン
      </button>
    );
  }
  return (
    <button
      className="account-button"
      onClick={() => confirm(`${a.email} からログアウトしますか？`) && signOut()}
      title={`${a.name ?? ''} ${a.email ?? ''}${a.isEditor ? '（編集者）' : '（閲覧のみ）'}\nクリックでログアウト`}
    >
      <Avatar name={a.name ?? a.email ?? '?'} src={a.photoURL ?? ''} color={a.isEditor ? '#582eff' : '#787585'} size={36} />
      {a.isEditor && <Icon name="edit" className="account-badge" />}
    </button>
  );
}

function NoTournament() {
  const canEdit = useCanEdit();
  return (
    <section className="card empty-tournament">
      <Icon name="emoji_events" />
      <h1 className="headline">大会がまだありません</h1>
      <p className="muted">
        大会・選手 DB は全員で共通です。ここで作った大会は、ほかの運営メンバーの画面にもすぐ表示されます。
      </p>
      {canEdit ? (
        <button className="btn filled" onClick={createTournament}>
          <Icon name="add" />
          大会を作成
        </button>
      ) : (
        <p className="muted body-s">大会を作成するには、編集者のアカウントでログインしてください。</p>
      )}
    </section>
  );
}
