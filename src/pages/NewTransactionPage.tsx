import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TransactionForm } from '../components/TransactionForm';

export function NewTransactionPage() {
  const navigate = useNavigate();
  // 保存後も入力画面にとどまり、続けて入力できるようにする
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  return (
    <>
      <h1>入力</h1>
      {savedMessage && (
        <p className="notice" role="status" data-testid="saved-message">
          保存しました（{savedMessage}）
        </p>
      )}
      <TransactionForm
        onSaved={(_id, budgetAlert, summary) => {
          setSavedMessage(summary);
          navigate('/new', { replace: true, state: { budgetAlert } });
        }}
        onError={() => setSavedMessage(null)}
      />
    </>
  );
}
