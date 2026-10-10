# Tasks

## 1. 依存関係の追加

- [x] 1.1 `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` を実行し、`package.json` の `dependencies` に追加されること、`npm run typecheck` と `npm run build` が通ることを確認する。

## 2. 並び順の保存ロジック

- [x] 2.1 `src/db/repository.ts` のカテゴリ節に `reorderCategories(orderedIds: string[], db = defaultDb)` を追加する。対象カテゴリをすべて取得し、存在しない ID や種別の混在があればエラーを投げる。対象の現在の `sortOrder` 値を昇順にした配列を、`orderedIds` の順に割り当てて1トランザクションで更新する（design.md 決定3）。検証: `npm run typecheck` が通る。
- [x] 2.2 `src/db/repository.test.ts` の `describe('カテゴリ')` にテストを追加する: (a) 表示中の出費カテゴリで「外食」を先頭にすると `orderBy('sortOrder')` の出費の並びが「外食, 食費, 日用品, …」になる、(b) 収入カテゴリの `sortOrder` は変わらない、(c) 「Amazon」を非表示にしたまま並べ替えて再表示すると「趣味・娯楽」と「衣服」の間に戻る、(d) 出費と収入の ID を混ぜると拒否される。検証: `npm test` で該当テストが通る。

## 3. 設定画面のドラッグ並べ替えUI

- [x] 3.1 `src/components/settings/CategoriesSection.tsx` の表示中カテゴリ一覧を `DndContext` + `SortableContext`（`verticalListSortingStrategy`）で包み、`CategoryRow` を `useSortable` を使う行にする。各行の先頭に `aria-label="<名前>を並べ替え"` のドラッグハンドル（`<button type="button">`）を置き、`listeners`/`attributes` はハンドルにだけ渡す。センサーは `PointerSensor`（`activationConstraint: { distance: 4 }`）と `KeyboardSensor`（`sortableKeyboardCoordinates`）。名前変更の編集中の行はハンドルを無効化する。検証: `npm run typecheck` が通る。
- [x] 3.2 `onDragEnd` で `arrayMove` により新しい順序を計算し、ローカル state に楽観的に反映したうえで `reorderCategories` を呼ぶ。`useCategories` の結果が変わったらローカル state を破棄する（design.md 決定4）。種別切替時もローカル state を破棄する。検証: `npm run dev` でドロップ直後に行が元の位置へ戻るちらつきがないことを目視確認する。
- [x] 3.3 `src/index.css` にドラッグハンドル（`touch-action: none`、`cursor: grab`、十分なタップ領域）とドラッグ中の行（影・不透明度など、既存の `.list` の配色変数に揃える）のスタイルを追加する。検証: `npm run dev` でスマホ幅（DevTools のデバイスエミュレーション）にし、ハンドルのタッチドラッグで並べ替えられ、ドラッグ中に画面がスクロールしないこと、ハンドル以外の部分では一覧が通常どおりスクロールし「名前変更」「非表示」がタップできることを確認する。
- [x] 3.4 `src/pages/settings.test.tsx` の `describe('カテゴリ管理')` にテストを追加する: (a) 表示中の各カテゴリに「<名前>を並べ替え」ハンドルがあり、非表示カテゴリにはない、(b) `reorderCategories` で「外食」を先頭にすると設定画面の一覧と出費入力画面のカテゴリチップの先頭が「外食」になる。既存のカテゴリ管理テストが引き続き通ること。検証: `npm test` が通る。

## 4. 仕上げ

- [x] 4.1 `npm test`・`npm run lint`・`npm run typecheck`・`npm run build` をすべて実行して成功を確認し、ブラウザで「並べ替え → 再読み込みしても順序が維持される → 入力画面のチップ順に反映される」を一通り確認する。
