import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { TransactionForm } from '../components/TransactionForm';
import { db } from '../db/db';
import { deleteTransaction } from '../db/repository';
import { computeBalance } from '../domain/balance';
import { useAccounts, useTransactions } from '../hooks/useData';

export function EditTransactionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  // 読み込み中は undefined、見つからなければ null
  const tx = useLiveQuery(async () => (await db.transactions.get(id)) ?? null, [id]);
  const accounts = useAccounts();
  const transactions = useTransactions();

  if (tx === undefined || transactions === undefined || accounts.length === 0) return null;
  if (tx === null) {
    return (
      <>
        <h1>取引の編集</h1>
        <p className="empty">取引が見つかりません</p>
      </>
    );
  }

  // 残高調整は差額ではなく「実際の残高」を入力し直してもらう
  let initialAmount = String(tx.amount);
  if (tx.type === 'adjustment') {
    const account = accounts.find((a) => a.id === tx.accountId);
    const balance = account ? computeBalance(account, transactions, tx.date) : null;
    if (balance !== null) initialAmount = String(balance);
  }

  async function handleDelete() {
    if (!window.confirm('この取引を削除しますか？')) return;
    await deleteTransaction(id);
    navigate('/transactions');
  }

  return (
    <>
      <h1>取引の編集</h1>
      <TransactionForm
        key={tx.id}
        initial={tx}
        initialAmount={initialAmount}
        onSaved={(_id, budgetAlert) => navigate('/transactions', { state: { budgetAlert } })}
      />
      <div className="form-actions">
        <button type="button" className="danger" onClick={handleDelete}>
          この取引を削除
        </button>
      </div>
    </>
  );
}
