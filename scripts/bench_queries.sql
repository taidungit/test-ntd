-- Run via scripts/bench.sh. Assumes: table todos(id, user_id, completed, created_at, ...)
\set QUIET 1
\pset pager off
\timing off

-- Pick the heaviest user (most todos) to make the difference visible
SELECT user_id AS uid FROM todos GROUP BY user_id ORDER BY count(*) DESC LIMIT 1 \gset
\echo '### user_id =' :uid

\echo '### Q1 user todo list, newest first (page 1)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM todos WHERE user_id = :'uid' ORDER BY created_at DESC, id DESC LIMIT 20;

\echo '### Q2 incomplete todos, newest first'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM todos WHERE user_id = :'uid' AND completed = false ORDER BY created_at DESC, id DESC LIMIT 20;

\echo '### Q3 pagination (OFFSET 50)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM todos WHERE user_id = :'uid' ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 50;

\echo '### Q4 count todos per user'
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM todos WHERE user_id = :'uid';

\echo '### Q5 count by status'
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM todos WHERE user_id = :'uid' AND completed = true;
