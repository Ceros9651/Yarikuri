import type {
  DBCore,
  DBCoreMutateRequest,
  DBCoreMutateResponse,
  DBCoreTable,
  DBCoreTransaction,
  Middleware,
} from 'dexie';
import { transactionDeltas, type BalanceDelta } from '../domain/balance';
import type { Transaction } from '../domain/types';

/** DBCoreRangeType.Any（const enum のため値で持つ） */
const RANGE_ANY = 3;

export class MissingBalanceDeltasError extends Error {
  constructor() {
    super('取引を書き込むトランザクションには balanceDeltas の表を含めてください');
    this.name = 'MissingBalanceDeltasError';
  }
}

function hasStore(trans: DBCoreTransaction, name: string): boolean {
  // IndexedDB の DBCore ではトランザクションは IDBTransaction そのもの
  const names = (trans as unknown as Partial<IDBTransaction>).objectStoreNames;
  return names ? names.contains(name) : true;
}

type Sums = Map<string, BalanceDelta>;

function accumulate(sums: Sums, tx: Transaction | undefined, sign: 1 | -1) {
  if (!tx) return;
  for (const d of transactionDeltas(tx)) {
    const key = `${d.accountId}\u0000${d.month}`;
    const sum = sums.get(key);
    if (sum) sum.delta += sign * d.delta;
    else sums.set(key, { ...d, delta: sign * d.delta });
  }
}

async function applySums(deltas: DBCoreTable, trans: DBCoreTransaction, sums: Sums) {
  const changes = [...sums.values()].filter((s) => s.delta !== 0);
  if (changes.length === 0) return;
  const keys = changes.map((c) => [c.accountId, c.month]);
  const current = (await deltas.getMany({ trans, keys })) as (BalanceDelta | undefined)[];
  const puts: BalanceDelta[] = [];
  const deletes: unknown[] = [];
  changes.forEach((c, i) => {
    const delta = (current[i]?.delta ?? 0) + c.delta;
    if (delta === 0) deletes.push(keys[i]);
    else puts.push({ accountId: c.accountId, month: c.month, delta });
  });
  if (puts.length > 0) await deltas.mutate({ type: 'put', trans, values: puts });
  if (deletes.length > 0) await deltas.mutate({ type: 'delete', trans, keys: deletes });
}

function succeeded(res: DBCoreMutateResponse, i: number): boolean {
  return !(i in res.failures);
}

/**
 * 取引の表への書き込み（add・put・delete・deleteRange）に合わせて、同じトランザクションで
 * 口座×月の増減の表 balanceDeltas を更新する。どの経路で取引を書いても表が食い違わないようにするため、
 * balanceDeltas を含まないトランザクションでの書き込みはエラーにする
 */
export const balanceDeltasMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'BalanceDeltas',
  create(down) {
    return {
      ...down,
      table(name) {
        const table = down.table(name);
        if (name !== 'transactions') return table;
        const keyOf = (value: Transaction) => value.id;
        return {
          ...table,
          async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
            const { trans } = req;
            if (!hasStore(trans, 'balanceDeltas')) throw new MissingBalanceDeltasError();
            // version 4 への更新中は表がまだないので、書き込むときに取り出す
            const deltas = down.table('balanceDeltas');
            const sums: Sums = new Map();

            if (req.type === 'deleteRange') {
              if (req.range.type === RANGE_ANY) {
                const res = await table.mutate(req);
                await deltas.mutate({ type: 'deleteRange', trans, range: req.range });
                return res;
              }
              const old = (await table.query({
                trans,
                values: true,
                query: { index: table.schema.primaryKey, range: req.range },
              })) as { result: Transaction[] };
              const res = await table.mutate(req);
              for (const tx of old.result) accumulate(sums, tx, -1);
              await applySums(deltas, trans, sums);
              return res;
            }

            if (req.type === 'put' && req.updates && req.values.length === 0) {
              // Dexie Cloud 向けの「差分だけの更新」。このアプリでは使わない
              throw new Error('取引の表の差分だけの更新には対応していません');
            }

            const keys =
              req.type === 'delete'
                ? req.keys
                : (req.keys ?? (req.values as Transaction[]).map(keyOf));
            const old =
              req.type === 'add'
                ? []
                : ((await table.getMany({ trans, keys })) as (Transaction | undefined)[]);
            const res = await table.mutate(req);
            // 同じ要求の中で同じ id を何度も書く場合に備え、直前に書かれた値を追う
            const latest = new Map<unknown, Transaction | undefined>();
            keys.forEach((key, i) => {
              if (!succeeded(res, i)) return;
              const before = latest.has(key) ? latest.get(key) : old[i];
              const after = req.type === 'delete' ? undefined : (req.values[i] as Transaction);
              accumulate(sums, before, -1);
              accumulate(sums, after, 1);
              latest.set(key, after);
            });
            await applySums(deltas, trans, sums);
            return res;
          },
        };
      },
    };
  },
};
