# Task 3C – Database Performance & Indexing

## 1. How to reproduce
```bash
docker compose up -d --build
docker compose exec backend alembic downgrade a0790c76a129        # only if the new indexes are already applied (drops them)
docker compose exec postgres psql -U fabbi -d postgres -c "TRUNCATE todos;"   # the seed script skips if todos already has rows
docker compose exec -e SEED_USERS=10000 -e SEED_TODOS=1000000 backend python -m app.db.seed
docker compose exec postgres psql -U fabbi -d postgres -c "\d todos"          # only todos_pkey exists
scripts/bench.sh before
docker compose exec backend alembic upgrade head                   # apply the index migration
scripts/bench.sh after
```
Raw output: `bench/before_run*.txt`, `bench/after_run*.txt`.

## 2. Dataset and environment
- users: 10,000 · todos: 1,000,000 · PostgreSQL 16 (docker `postgres:16-alpine`), table size ~212 MB.
- Test user: `<uid>` (the user with the most todos, ~139 rows; see `bench/before_run1.txt`).
- Machine: `<CPU/RAM>`. Each measurement runs `VACUUM ANALYZE todos` first and 3 runs; the table reports the **median of 3 runs** (run 3 of "before" was an outlier at 128-250 ms, likely host noise).
- Before the change, `todos` had only `todos_pkey`; the `user_id` foreign key column had no index.
- The whole procedure was executed twice from scratch with consistent results (same plans, same order-of-magnitude timings).

## 3. Results (Execution Time, ms, median of 3 runs)
| Query | Plan before | Before | Plan after | After | Speedup |
|---|---|---|---|---|---|
| Q1 user list, `ORDER BY created_at DESC, id DESC LIMIT 20` | Parallel Seq Scan + top-N Sort | 68.941 | Index Scan `ix_todos_user_created_id` (no Sort) | 0.151 | ~457x |
| Q2 `completed=false`, newest first | Parallel Seq Scan + Sort | 78.233 | Index Scan `ix_todos_user_completed_created` + Incremental Sort | 0.305 | ~256x |
| Q3 `OFFSET 50` | Parallel Seq Scan + Sort | 71.165 | Index Scan `ix_todos_user_created_id` | 0.325 | ~219x |
| Q4 `count(*)` per user | Parallel Seq Scan | 66.867 | Index Only Scan | 0.140 | ~478x |
| Q5 `count(*)` completed=true | Parallel Seq Scan | 78.778 | Index Only Scan | 0.144 | ~547x |

Raw runs (ms) - before: Q1 68.9/60.6/129.7, Q2 78.2/75.2/249.7, Q3 71.2/65.5/127.7, Q4 66.9/56.4/167.6, Q5 78.8/64.2/133.0; after: Q1 0.203/0.151/0.112, Q2 0.397/0.239/0.305, Q3 0.441/0.325/0.319, Q4 0.169/0.140/0.124, Q5 0.144/0.155/0.104.

Before: every query scanned the whole table (~27,000 pages, ~210 MB, ~1 million rows filtered out) to return ~140 rows for one user. After: only a few dozen pages are read through the index (e.g. Q1 23 buffers, Q4 5 buffers in an earlier identical run).

## 4. Indexes added (`backend/alembic/versions/20261003_add_todo_indexes.py`)
1. `ix_todos_user_completed_created (user_id, completed, created_at DESC)` – status filter + ordering (Q2, Q5).
2. `ix_todos_user_created_id (user_id, created_at DESC, id DESC)` – unfiltered list and `created_at DESC, id DESC` pagination (Q1, Q3, Q4).

Why two indexes: with index 1 alone, a query without a `completed` filter cannot use the `created_at` ordering (`completed` sits in the middle of the key), so Postgres would still have to sort.

Note: Q2 still has a small Incremental Sort step (0.28 ms total) because index 1 does not include `id` for the tie-break. Appending `id DESC` to index 1 would remove it if needed.

## 5. Trade-offs
- **Write latency:** every INSERT/DELETE now maintains 2 extra indexes (3 including the primary key). UPDATEs to `completed` or `created_at` touch indexed columns, so they lose HOT updates. A todo app is read-heavy, so the trade-off is reasonable. Bulk-seeding 1,000,000 todos took 87.9 s without the new indexes vs 99.5 s with them (+11.5 s, ~13%; single run each, and the time includes Python/Faker data generation, so the pure index-maintenance overhead is a fraction of total).
- **Storage:** `ix_todos_user_completed_created` 47 MB, `ix_todos_user_created_id` 56 MB (103 MB total vs a 212 MB table, ~49%); `todos_pkey` 38 MB. All indexes together: 141 MB. This costs extra RAM for caching and extra VACUUM/backup time.
- **Migration safety on large tables:** uses `CREATE INDEX CONCURRENTLY` (does not block writes), run inside `autocommit_block()` because it cannot run in a transaction. It takes roughly 2x longer, and a failure leaves an `INVALID` index (check `pg_index.indisvalid`; both indexes were verified as `t`). `if_not_exists` makes re-runs safe; set a `lock_timeout` and run off-peak.
- **No redundant indexes:** there was no standalone `(user_id)` index before, so no old index needed to be dropped.
