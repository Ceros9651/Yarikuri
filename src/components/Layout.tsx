import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { BudgetAlert } from '../domain/budget';

/** タブの線画アイコン。色は文字と同じ（currentColor）で、選択中は文字と一緒に緑になる */
function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const TABS = [
  {
    to: '/',
    label: 'ホーム',
    end: true,
    icon: (
      <TabIcon>
        <path d="M3.5 10.5 12 3.5l8.5 7" />
        <path d="M5.5 9v11.5h13V9" />
        <path d="M10 20.5v-6h4v6" />
      </TabIcon>
    ),
  },
  {
    to: '/transactions',
    label: '取引一覧',
    end: false,
    icon: (
      <TabIcon>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
      </TabIcon>
    ),
  },
  {
    to: '/new',
    label: '入力',
    end: false,
    icon: (
      <TabIcon>
        <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
        <path d="m13 7 4 4" />
      </TabIcon>
    ),
  },
  {
    to: '/settings',
    label: '設定',
    end: false,
    icon: (
      <TabIcon>
        <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
        <circle cx="15" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="17" cy="18" r="2" />
      </TabIcon>
    ),
  },
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
