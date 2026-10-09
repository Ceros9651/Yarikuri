import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { BudgetAlert } from '../domain/budget';

const TABS = [
  { to: '/', label: 'ホーム', icon: '🏠', end: true },
  { to: '/transactions', label: '取引一覧', icon: '📋', end: false },
  { to: '/new', label: '入力', icon: '✏️', end: false },
  { to: '/settings', label: '設定', icon: '⚙️', end: false },
];

/** 出費の保存直後に、遷移先の画面で予算の注意・超過を知らせる。画面を移動すると消える */
function BudgetAlertNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const alert = (location.state as { budgetAlert?: BudgetAlert | null } | null)?.budgetAlert;
  if (!alert) return null;
  return (
    <div
      className={`notice budget-alert notice-row ${alert.status}`}
      role="status"
      data-testid="budget-alert"
    >
      <span>{alert.message}</span>
      <button
        type="button"
        className="link"
        aria-label="予算のお知らせを閉じる"
        onClick={() => navigate(location, { replace: true, state: null })}
      >
        ×
      </button>
    </div>
  );
}

export function Layout() {
  return (
    <div className="app">
      <main className="content">
        <BudgetAlertNotice />
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
