import { useState, type FormEvent } from 'react';
import { addAccount, setAccountHidden, updateAccount, ValidationError } from '../../db/repository';
import { formatYen } from '../../domain/format';
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  type Account,
  type AccountType,
} from '../../domain/types';
import { parseInitialBalance } from '../../domain/validation';
import { useAccounts } from '../../hooks/useData';

const INITIAL_BALANCE_ERROR = '初期残高は0以上の整数で入力してください';

function errorMessage(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  throw err;
}

function AccountRow({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [initialBalance, setInitialBalance] = useState(String(account.initialBalance));
  const [error, setError] = useState('');
  const isCredit = account.type === 'credit';

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const balance = parseInitialBalance(initialBalance);
    if (!isCredit && balance === null) return setError(INITIAL_BALANCE_ERROR);
    try {
      await updateAccount(account.id, { name, initialBalance: balance ?? 0 });
      setEditing(false);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (editing) {
    return (
      <li>
        <form className="inline-form" onSubmit={handleSave}>
          <input aria-label="口座名" value={name} onChange={(e) => setName(e.target.value)} />
          {!isCredit && (
            <input
              aria-label="初期残高"
              inputMode="numeric"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
            />
          )}
          <button type="submit" className="primary">
            保存
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(account.name);
              setInitialBalance(String(account.initialBalance));
              setError('');
            }}
          >
            キャンセル
          </button>
          {error && (
            <em className="field-error" role="alert">
              {error}
            </em>
          )}
        </form>
      </li>
    );
  }

  return (
    <li>
      <span className="truncate">
        {account.name}
        {!isCredit && (
          <span className="muted">（初期残高 {formatYen(account.initialBalance)}）</span>
        )}
      </span>
      <span className="row-actions">
        <button
          type="button"
          className="link"
          onClick={() => setEditing(true)}
          aria-label={`${account.name}を編集`}
        >
          編集
        </button>
        <button
          type="button"
          className="link"
          onClick={() => setAccountHidden(account.id, true)}
          aria-label={`${account.name}を非表示`}
        >
          非表示
        </button>
      </span>
    </li>
  );
}

function AddAccountForm() {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [initialBalance, setInitialBalance] = useState('');
  const [error, setError] = useState('');
  const isCredit = type === 'credit';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const balance = parseInitialBalance(initialBalance);
    if (!isCredit && balance === null) return setError(INITIAL_BALANCE_ERROR);
    try {
      await addAccount({ name, type, initialBalance: isCredit ? 0 : (balance ?? 0) });
      setName('');
      setInitialBalance('');
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="口座の追加">
      <h3 className="muted">口座を追加</h3>
      <div className="inline-form">
        <select
          aria-label="種別"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          aria-label="口座名"
          placeholder={isCredit ? '例：楽天カード' : '例：A銀行'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {!isCredit && (
          <input
            aria-label="初期残高"
            inputMode="numeric"
            placeholder="初期残高（円）"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
          />
        )}
        <button type="submit" className="primary">
          追加
        </button>
      </div>
      {error && (
        <em className="field-error" role="alert">
          {error}
        </em>
      )}
    </form>
  );
}

export function AccountsSection() {
  const accounts = useAccounts();
  const hidden = accounts.filter((a) => a.hidden);

  return (
    <section className="card" aria-labelledby="accounts-heading">
      <h2 id="accounts-heading">口座・カード</h2>
      {ACCOUNT_TYPES.map((type) => {
        const items = accounts.filter((a) => a.type === type && !a.hidden);
        if (items.length === 0) return null;
        return (
          <div key={type} role="group" aria-label={ACCOUNT_TYPE_LABELS[type]}>
            <h3 className="muted">{ACCOUNT_TYPE_LABELS[type]}</h3>
            <ul className="list">
              {items.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </ul>
          </div>
        );
      })}
      {hidden.length > 0 && (
        <div role="group" aria-label="非表示の口座">
          <h3 className="muted">非表示の口座</h3>
          <ul className="list">
            {hidden.map((a) => (
              <li key={a.id}>
                <span className="truncate muted">
                  {a.name}（{ACCOUNT_TYPE_LABELS[a.type]}）
                </span>
                <button
                  type="button"
                  className="link"
                  onClick={() => setAccountHidden(a.id, false)}
                  aria-label={`${a.name}を再表示`}
                >
                  再表示
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AddAccountForm />
    </section>
  );
}
