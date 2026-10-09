import { useState, type FormEvent } from 'react';
import {
  addCategory,
  renameCategory,
  setCategoryHidden,
  ValidationError,
} from '../../db/repository';
import type { Category, CategoryKind } from '../../domain/types';
import { useCategories } from '../../hooks/useData';

const KIND_LABELS: Record<CategoryKind, string> = { expense: '出費', income: '収入' };

function errorMessage(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  throw err;
}

function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState('');

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    try {
      await renameCategory(category.id, name);
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
          <input aria-label="カテゴリ名" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary">
            保存
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(category.name);
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
      <span className="truncate">{category.name}</span>
      <span className="row-actions">
        <button
          type="button"
          className="link"
          onClick={() => setEditing(true)}
          aria-label={`${category.name}の名前を変更`}
        >
          名前変更
        </button>
        <button
          type="button"
          className="link"
          onClick={() => setCategoryHidden(category.id, true)}
          aria-label={`${category.name}を非表示`}
        >
          非表示
        </button>
      </span>
    </li>
  );
}

export function CategoriesSection() {
  const categories = useCategories();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const ofKind = categories.filter((c) => c.kind === kind);
  const visible = ofKind.filter((c) => !c.hidden);
  const hidden = ofKind.filter((c) => c.hidden);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    try {
      await addCategory({ kind, name });
      setName('');
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card" aria-labelledby="categories-settings-heading">
      <h2 id="categories-settings-heading">カテゴリ</h2>
      <div className="segmented" role="group" aria-label="カテゴリの種類">
        {(['expense', 'income'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setError('');
            }}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <ul className="list" aria-label={`${KIND_LABELS[kind]}のカテゴリ`}>
        {visible.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
      </ul>
      {hidden.length > 0 && (
        <div role="group" aria-label="非表示のカテゴリ">
          <h3 className="muted">非表示のカテゴリ</h3>
          <ul className="list">
            {hidden.map((c) => (
              <li key={c.id}>
                <span className="truncate muted">{c.name}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => setCategoryHidden(c.id, false)}
                  aria-label={`${c.name}を再表示`}
                >
                  再表示
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="inline-form" onSubmit={handleAdd} aria-label="カテゴリの追加">
        <input
          aria-label="新しいカテゴリ名"
          placeholder={`${KIND_LABELS[kind]}カテゴリを追加`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="primary">
          追加
        </button>
      </form>
      {error && (
        <em className="field-error" role="alert">
          {error}
        </em>
      )}
    </section>
  );
}
