import { useLiveQuery } from 'dexie-react-hooks';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { db as defaultDb, type YarikuriDB } from '../db/db';
import { firebaseConfig } from './config';
import {
  clearSyncState,
  getSyncUid,
  linkDevice,
  SyncEngine,
  toSyncError,
  type EngineState,
} from './engine';
import type { SyncAuth, SyncError, SyncRemote, SyncUser } from './remote';

export interface SyncServices {
  auth: SyncAuth;
  createRemote(uid: string): SyncRemote;
}

/**
 * - signedOut: サインインしていない（端末の中だけで使う）
 * - linking: サインイン中、または初めてサインインした端末の処理中
 * - syncing: 送信中、または最初の受信を待っている
 * - synced: 送受信が済んでいる
 * - offline: 通信できない。送れていない変更は通信が戻ったら送る
 * - error: 同期できない（権限・無料枠など）
 */
export type SyncStatus = 'signedOut' | 'linking' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncState {
  /** 接続設定のあるビルドか */
  configured: boolean;
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: string | undefined;
  /** 他の端末へ送れていない変更がある */
  pending: boolean;
  error: SyncError | null;
  /** 形式が読めず取り込まなかった記録の数 */
  invalidRecords: number;
  /** サインインできなかったときの理由 */
  message: string | null;
  /** 初めてサインインした端末で、端末のデータを置き換えてよいかの確認を待っている */
  replacePrompt: { transactions: number } | null;
  answerReplace(ok: boolean): void;
  /**
   * サインインの前に Firebase を読み込んで準備しておく。iPhone の Safari はボタンを押した直後にしか
   * ポップアップを開かせないため、押してから読み込むと Google の画面が開かない
   */
  prepare(): void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export interface SyncOptions {
  /** Firebase の窓口の読み込み。既定は firebase.ts を dynamic import する */
  loadServices?: () => Promise<SyncServices>;
  configured?: boolean;
  db?: YarikuriDB;
}

const SyncContext = createContext<SyncState | null>(null);

function loadFirebase(): Promise<SyncServices> {
  return import('./firebase').then((m) => m.createFirebaseServices(firebaseConfig!));
}

export const UPLOAD_CONFIRM =
  'この端末のデータをクラウドに保存して、同期を始めます。同じ Google アカウントでサインインした端末で、同じデータを見られるようになります。よろしいですか？';
export const SIGN_OUT_CONFIRM =
  'まだ他の端末に送れていない変更があります。サインアウトすると、その変更は他の端末に届きません（この端末には残ります）。サインアウトしますか？';

type Phase = 'starting' | 'signedOut' | 'linking' | 'active';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * 端末間の同期の状態を持つ。サインインしていない端末では、設定画面の同期の欄を開くまで Firebase を
 * 読み込まない（起動時に読み込むのは同期したことのある端末だけ）。家計簿のデータを送るのはサインイン後だけ
 */
export function SyncProvider({
  children,
  loadServices = loadFirebase,
  configured = firebaseConfig !== null,
  db = defaultDb,
}: SyncOptions & { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [email, setEmail] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replacePrompt, setReplacePrompt] = useState<{ transactions: number } | null>(null);
  const servicesRef = useRef<Promise<SyncServices> | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const replaceResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const online = useOnline();
  const outboxCount = useLiveQuery(() => db.outbox.count(), [db]) ?? 0;
  const lastSyncedAt = useLiveQuery(async () => (await db.meta.get('lastSyncedAt'))?.value, [db]);

  const services = useCallback(() => {
    servicesRef.current ??= loadServices().catch((e: unknown) => {
      // 読み込みに失敗したら、次に呼ばれたときに読み込み直す
      servicesRef.current = null;
      throw e;
    });
    return servicesRef.current;
  }, [loadServices]);

  const prepare = useCallback(() => {
    services().catch((e: unknown) => console.warn('同期の準備に失敗しました', e));
  }, [services]);

  const startEngine = useCallback(
    (s: SyncServices, user: SyncUser) => {
      engineRef.current?.stop();
      const engine = new SyncEngine(db, s.createRemote(user.uid), setEngineState);
      engineRef.current = engine;
      setEmail(user.email);
      setPhase('active');
      void engine.start();
    },
    [db],
  );

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setEngineState(null);
  }, []);

  // 起動時: 同期している端末だけ、保存されたサインイン状態で同期を再開する
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const uid = await getSyncUid(db);
      if (cancelled) return;
      if (!uid || !configured) {
        setPhase('signedOut');
        return;
      }
      const s = await services();
      if (cancelled) return;
      unsubscribe = s.auth.onChange((user) => {
        // 最初の通知（保存されたサインイン状態）だけで決める
        unsubscribe?.();
        unsubscribe = undefined;
        if (cancelled) return;
        if (user?.uid === uid) {
          startEngine(s, user);
          return;
        }
        // サインインが切れている、または初めてのサインインの処理が終わらずに閉じられた
        void (async () => {
          if (user) await s.auth.signOut();
          await clearSyncState(db);
          setPhase('signedOut');
        })();
      });
    })().catch((e: unknown) => {
      if (!cancelled) {
        setMessage(`同期を再開できませんでした：${toSyncError(e).message}`);
        setPhase('signedOut');
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, [db, configured, services, startEngine]);

  const signIn = useCallback(async () => {
    setMessage(null);
    setPhase('linking');
    let s: SyncServices | undefined;
    try {
      s = await services();
      const user = await s.auth.signIn();
      if (!user) {
        setPhase('signedOut');
        return;
      }
      const result = await linkDevice(db, s.createRemote(user.uid), user.uid, {
        confirmUpload: async () => window.confirm(UPLOAD_CONFIRM),
        confirmReplace: async () => {
          const transactions = await db.transactions.count();
          return new Promise<boolean>((resolve) => {
            replaceResolveRef.current = resolve;
            setReplacePrompt({ transactions });
          });
        },
      });
      if (result === 'cancelled') {
        await s.auth.signOut();
        setPhase('signedOut');
        return;
      }
      startEngine(s, user);
    } catch (e) {
      await s?.auth.signOut().catch(() => {});
      setMessage(`サインインできませんでした：${toSyncError(e).message}`);
      setPhase('signedOut');
    }
  }, [db, services, startEngine]);

  const answerReplace = useCallback((ok: boolean) => {
    replaceResolveRef.current?.(ok);
    replaceResolveRef.current = null;
    setReplacePrompt(null);
  }, []);

  const signOut = useCallback(async () => {
    if ((await db.outbox.count()) > 0 && !window.confirm(SIGN_OUT_CONFIRM)) return;
    stopEngine();
    await clearSyncState(db);
    const s = await services();
    await s.auth.signOut();
    setEmail(null);
    setMessage(null);
    setPhase('signedOut');
  }, [db, services, stopEngine]);

  let status: SyncStatus;
  if (phase === 'active') {
    const error = engineState?.error;
    if (error && error.kind !== 'offline') status = 'error';
    else if (!online || error) status = 'offline';
    else if (engineState?.busy ?? true) status = 'syncing';
    else status = 'synced';
  } else {
    status = phase === 'linking' ? 'linking' : 'signedOut';
  }

  const value: SyncState = {
    configured,
    status,
    email: phase === 'active' ? email : null,
    lastSyncedAt: phase === 'active' ? lastSyncedAt : undefined,
    pending: phase === 'active' && outboxCount > 0,
    error: phase === 'active' ? (engineState?.error ?? null) : null,
    invalidRecords: engineState?.invalidRecords ?? 0,
    message,
    replacePrompt,
    answerReplace,
    prepare,
    signIn,
    signOut,
  };
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncState {
  const state = useContext(SyncContext);
  if (!state) throw new Error('SyncProvider がありません');
  return state;
}
