import { AccountsSection } from '../components/settings/AccountsSection';
import { BackupSection } from '../components/settings/BackupSection';
import { CategoriesSection } from '../components/settings/CategoriesSection';

export function SettingsPage() {
  return (
    <>
      <h1>設定</h1>
      <AccountsSection />
      <CategoriesSection />
      <BackupSection />
    </>
  );
}
