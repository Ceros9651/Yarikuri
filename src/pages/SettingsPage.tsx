import { AccountsSection } from '../components/settings/AccountsSection';
import { BackupSection } from '../components/settings/BackupSection';
import { BudgetsSection } from '../components/settings/BudgetsSection';
import { CategoriesSection } from '../components/settings/CategoriesSection';
import { SyncSection } from '../components/settings/SyncSection';

export function SettingsPage() {
  return (
    <>
      <h1>設定</h1>
      <AccountsSection />
      <CategoriesSection />
      <BudgetsSection />
      <SyncSection />
      <BackupSection />
    </>
  );
}
