import { useEffect, useMemo, useState } from 'react';
import { Icon, IconButton, SnackbarHost } from './components/ui';
import { computeBracket } from './lib/bracket';
import { AnnouncePage } from './pages/AnnouncePage';
import { BracketPage } from './pages/BracketPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
import { TeamsPage } from './pages/TeamsPage';
import { WeaponsPage } from './pages/WeaponsPage';
import { useRoute } from './router';
import { update, useApp, useCurrent, useSaveError } from './store';

const NAV = [
  { path: '', label: 'ホーム', icon: 'home' },
  { path: 'teams', label: 'チーム', icon: 'groups' },
  { path: 'weapons', label: 'ブキ表', icon: 'table_view' },
  { path: 'bracket', label: 'トーナメント', icon: 'account_tree' },
  { path: 'announce', label: '告知', icon: 'campaign' },
  { path: 'settings', label: '設定', icon: 'settings' },
];

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
  const rounds = useMemo(() => computeBracket(t), [t]);
  const [page, sub] = route;
  const current = page ?? '';

  let content;
  switch (page) {
    case 'teams':
      content = sub ? <TeamDetailPage t={t} teamId={sub} rounds={rounds} /> : <TeamsPage t={t} rounds={rounds} />;
      break;
    case 'weapons':
      content = <WeaponsPage t={t} rounds={rounds} />;
      break;
    case 'bracket':
      content = <BracketPage t={t} rounds={rounds} />;
      break;
    case 'announce':
      content = <AnnouncePage t={t} rounds={rounds} />;
      break;
    case 'settings':
      content = <SettingsPage t={t} />;
      break;
    default:
      content = <HomePage t={t} rounds={rounds} />;
  }

  const navItems = NAV.map((n) => {
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
          <div className="select-wrap">
            <select
              className="input tournament-select"
              value={app.currentId}
              onChange={(e) => update((d) => void (d.currentId = e.target.value))}
              aria-label="表示する大会"
            >
              {app.tournaments.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <IconButton
            icon="present_to_all"
            label={shareMode ? '画面共有モードを終了' : '画面共有モード（文字を大きく）'}
            selected={shareMode}
            onClick={() => setShareMode(!shareMode)}
          />
        </header>
        {saveError && (
          <div className="banner error">
            <Icon name="warning" />
            ブラウザへの保存に失敗しました。設定ページからデータを書き出して保管してください。({saveError})
          </div>
        )}
        <main className="main">{content}</main>
      </div>
      <nav className="nav-bar" aria-label="メニュー">
        {navItems}
      </nav>
      <SnackbarHost />
    </div>
  );
}
