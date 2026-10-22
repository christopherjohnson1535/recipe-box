# Plan: issue #5 search, tag filters, sort
1. Backend `list`: q = websearch tsquery on `search` OR title ilike prefix (escaped) OR prefix tsquery (`lasag:*`, skipped when q uses quotes/-/or). Default order when q and no sort: title-prefix, ts_rank, newest. Explicit sort wins.
2. `search` column covers title, description, notes, ingredients (not tags); tag filter stays separate (AND).
3. Tests `backend/tests/search.rs` incl. 2,000-row timing (< 300 ms after warm-up).
4. Frontend: `components/search/SearchBar` (client, debounced `router.replace`, keeps focus, works with GET without JS), `SortMenu` using new `ui/Select`.
5. Home page: count text, empty state with Clear search, chips with counts that keep q and sort, `?sort=` in URL.
6. Vitest: debounce/URL logic, sort control, count/empty text.
7. Docs: API.md, UI.md, wiki "Finding recipes".
