import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'ホーム', icon: '🏠', end: true },
  { to: '/transactions', label: '取引一覧', icon: '📋', end: false },
  { to: '/new', label: '入力', icon: '✏️', end: false },
  { to: '/settings', label: '設定', icon: '⚙️', end: false },
];

export function Layout() {
  return (
    <div className="app">
      <main className="content">
        <Outlet />
      </main>
      <nav className="tab-bar" aria-label="メインメニュー">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
            <span className="tab-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
