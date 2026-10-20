import { AccountsSection } from '../components/settings/AccountsSection';
import { BackupSection } from '../components/settings/BackupSection';
import { BudgetsSection } from '../components/settings/BudgetsSection';
import { CategoriesSection } from '../components/settings/CategoriesSection';
import { SignInCheck } from '../components/settings/SignInCheck';

export function SettingsPage() {
  return (
    <>
      <h1>設定</h1>
      <AccountsSection />
      <CategoriesSection />
      <BudgetsSection />
      <BackupSection />
      <SignInCheck />
    </>
  );
}
