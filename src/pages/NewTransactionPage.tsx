import { useNavigate } from 'react-router-dom';
import { TransactionForm } from '../components/TransactionForm';

export function NewTransactionPage() {
  const navigate = useNavigate();
  return (
    <>
      <h1>入力</h1>
      <TransactionForm onSaved={(_id, budgetAlert) => navigate('/', { state: { budgetAlert } })} />
    </>
  );
}
