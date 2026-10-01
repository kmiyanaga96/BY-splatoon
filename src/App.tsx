import { useMemo } from 'react';
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
  { path: '', label: 'ホーム' },
  { path: 'teams', label: 'チーム' },
  { path: 'weapons', label: 'ブキ表' },
  { path: 'bracket', label: 'トーナメント' },
  { path: 'announce', label: '告知' },
  { path: 'settings', label: '設定' },
];

export function App() {
  const app = useApp();
  const t = useCurrent();
  const route = useRoute();
  const saveError = useSaveError();
  const rounds = useMemo(() => computeBracket(t), [t]);
  const [page, sub] = route;

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

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">BY</span>
          <span className="brand-text">スプラ大会ツール</span>
        </div>
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
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.path} href={`#/${n.path}`} className={(page ?? '') === n.path ? 'active' : ''}>
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      {saveError && (
        <div className="banner error">ブラウザへの保存に失敗しました。設定ページからデータを書き出して保管してください。({saveError})</div>
      )}
      <main className="main">{content}</main>
    </div>
  );
}
