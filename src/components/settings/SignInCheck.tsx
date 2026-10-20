// タスク 1.4 の実機確認用の仮の欄。6.1 の SyncSection に置き換えて消す
import { useEffect, useState } from 'react';
import { firebaseConfig, UNCONFIGURED_MESSAGE } from '../../sync/config';
import type { SyncAuth, SyncUser } from '../../sync/remote';

let authPromise: Promise<SyncAuth> | undefined;

function loadAuth(): Promise<SyncAuth> {
  authPromise ??= import('../../sync/firebase').then((m) => m.createFirebaseAuth(firebaseConfig!));
  return authPromise;
}

export function SignInCheck() {
  const [user, setUser] = useState<SyncUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfig) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    loadAuth().then((auth) => {
      if (!cancelled) unsubscribe = auth.onChange(setUser);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function handleSignIn() {
    setMessage(null);
    try {
      const signedIn = await (await loadAuth()).signIn();
      if (!signedIn) setMessage('サインインしませんでした');
    } catch (e) {
      setMessage(`サインインできませんでした：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <section aria-labelledby="signin-check-heading">
      <h2 id="signin-check-heading">サインインの確認（仮）</h2>
      {!firebaseConfig ? (
        <p className="muted">{UNCONFIGURED_MESSAGE}</p>
      ) : user ? (
        <>
          <p className="muted">{user.email} でサインインしています</p>
          <div className="form-actions">
            <button type="button" onClick={async () => (await loadAuth()).signOut()}>
              サインアウト
            </button>
          </div>
        </>
      ) : (
        <div className="form-actions">
          <button type="button" onClick={handleSignIn}>
            Google でサインイン
          </button>
        </div>
      )}
      {message && (
        <p className="notice error" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
