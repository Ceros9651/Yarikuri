// /ui-review 用のサンプルデータ投入スクリプト。
// Playwright MCP の browser_evaluate の `function` に、このコメントの後ろの関数式（末尾の ; は除く）をそのまま渡す。
//
// - 対象は Playwright のブラウザ内の IndexedDB（yarikuri）だけ。利用者の端末のデータには触れない。
// - アプリを一度開いて初期データ（財布・既定カテゴリ）が入った後に実行する。実行後はページを再読み込みする。
// - 何度実行しても同じ状態になる（取引・予算は全消去してから入れ直す）。日付は実行日の月と前月に置く。
// - 編集画面の確認には固定 ID の取引 `sample-tx-01` を使う（#/transactions/sample-tx-01）。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const req = (r) =>
    new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });

  // アプリ（Dexie）が DB を作り、初期データを入れ終わるまで待つ。
  // 先に indexedDB.open を呼ぶと空の DB ができてしまうので、存在確認してから開く
  let db = null;
  for (let i = 0; i < 100 && !db; i++) {
    const names = (await indexedDB.databases()).map((d) => d.name);
    if (names.includes('yarikuri')) {
      const opened = await req(indexedDB.open('yarikuri'));
      const ready =
        opened.objectStoreNames.contains('budgets') &&
        (await req(opened.transaction('meta').objectStore('meta').get('seeded')));
      if (ready) db = opened;
      else opened.close();
    }
    if (!db) await sleep(100);
  }
  if (!db) throw new Error('アプリの DB が見つからない。先にアプリの画面を開いてから実行すること');

  const all = (store) => req(db.transaction(store).objectStore(store).getAll());
  const accounts = await all('accounts');
  const categories = await all('categories');
  const cat = (kind, name) => categories.find((c) => c.kind === kind && c.name === name)?.id;
  const wallet = accounts.find((a) => a.type === 'cash' && !a.id.startsWith('sample-'));

  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const thisMonth = ym(now);
  const lastMonth = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  // 今月分は今日より先の日付にしない
  const day = (month, d) => `${month}-${pad(month === thisMonth ? Math.min(d, now.getDate()) : d)}`;
  const iso = now.toISOString();

  const sampleAccounts = [
    { id: 'sample-bank', name: '三井住友銀行', type: 'bank', initialBalance: 320000, sortOrder: 1 },
    { id: 'sample-emoney', name: 'Suica', type: 'emoney', initialBalance: 2400, sortOrder: 2 },
    { id: 'sample-credit', name: '楽天カード', type: 'credit', initialBalance: 0, sortOrder: 3 },
  ].map((a) => ({ ...a, hidden: false, createdAt: iso }));

  const W = wallet?.id ?? 'sample-bank';
  // [type, month, day, amount, accountId, categoryName or toAccountId, memo]
  const rows = [
    ['expense', thisMonth, 3, 1280, W, '食費', 'スーパー'],
    ['income', thisMonth, 1, 268000, 'sample-bank', '給与', ''],
    ['transfer', thisMonth, 1, 20000, 'sample-bank', 'sample-wallet-to', 'ATM 引き出し'],
    ['transfer', thisMonth, 2, 5000, 'sample-bank', 'sample-emoney', 'チャージ'],
    ['expense', thisMonth, 2, 3480, 'sample-credit', 'Amazon', '洗剤・キッチンペーパー'],
    ['expense', thisMonth, 4, 640, 'sample-emoney', '交通費', ''],
    ['expense', thisMonth, 5, 4200, W, '飲み会', '会社の同期'],
    ['expense', thisMonth, 6, 2380, W, '食費', ''],
    ['expense', thisMonth, 7, 1450, W, '外食', 'ラーメン'],
    ['expense', thisMonth, 8, 8800, 'sample-credit', '趣味・娯楽', 'ゲーム'],
    ['expense', thisMonth, 9, 980, W, '日用品', ''],
    ['expense', thisMonth, 10, 3120, W, '食費', 'まとめ買い'],
    ['expense', thisMonth, 11, 6500, 'sample-credit', '衣服', 'シャツ'],
    ['expense', thisMonth, 12, 2200, W, '外食', ''],
    ['adjustment', thisMonth, 12, -320, W, '', ''],
    ['income', lastMonth, 25, 268000, 'sample-bank', '給与', ''],
    ['expense', lastMonth, 5, 2980, W, '食費', ''],
    ['expense', lastMonth, 12, 5400, W, '飲み会', ''],
    ['expense', lastMonth, 18, 12800, 'sample-credit', 'Amazon', 'イヤホン'],
    ['expense', lastMonth, 22, 1800, W, '外食', ''],
  ];
  const transactions = rows.map(([type, month, d, amount, accountId, ref, memo], i) => {
    const tx = { id: `sample-tx-${pad(i + 1)}`, type, date: day(month, d), amount, accountId };
    if (type === 'transfer') tx.toAccountId = ref === 'sample-wallet-to' ? W : ref;
    if (type === 'income' || type === 'expense') tx.categoryId = cat(type, ref);
    if (memo) tx.memo = memo;
    return { ...tx, createdAt: iso, updatedAt: iso };
  });

  const budgets = [
    ['食費', 30000],
    ['外食', 4000],
    ['趣味・娯楽', 10000],
  ]
    .map(([name, amount]) => ({ categoryId: cat('expense', name), month: lastMonth, amount }))
    .filter((b) => b.categoryId);

  const tx = db.transaction(['accounts', 'transactions', 'budgets'], 'readwrite');
  const acc = tx.objectStore('accounts');
  for (const a of accounts) if (a.id.startsWith('sample-')) acc.delete(a.id);
  if (wallet) acc.put({ ...wallet, initialBalance: 15000 });
  for (const a of sampleAccounts) acc.put(a);
  tx.objectStore('transactions').clear();
  for (const t of transactions) tx.objectStore('transactions').put(t);
  tx.objectStore('budgets').clear();
  for (const b of budgets) tx.objectStore('budgets').put(b);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  return {
    accounts: sampleAccounts.length + (wallet ? 1 : 0),
    transactions: transactions.length,
    budgets: budgets.length,
    editUrlHash: '#/transactions/sample-tx-01',
    note: 'ページを再読み込みしてから撮影すること',
  };
};
