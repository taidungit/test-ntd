#!/usr/bin/env bash
# Usage: scripts/bench.sh before|after
# Runs 3 times (run 1 is cold cache) and prints each query's Execution Time.
set -euo pipefail
LABEL="${1:?usage: bench.sh before|after}"
mkdir -p bench
PSQL=(docker compose exec -T postgres psql -U "${POSTGRES_USER:-fabbi}" -d "${POSTGRES_DB:-postgres}")

"${PSQL[@]}" -c "VACUUM ANALYZE todos;" >/dev/null   # fresh stats -> stable plans
for run in 1 2 3; do
  "${PSQL[@]}" < scripts/bench_queries.sql > "bench/${LABEL}_run${run}.txt"
done

echo "== $LABEL: Execution Time (ms), run 1 / 2 / 3 =="
paste -d' ' \
  <(grep -E '^### Q' "bench/${LABEL}_run1.txt") \
  <(grep 'Execution Time' "bench/${LABEL}_run1.txt" | awk '{print $3}') \
  <(grep 'Execution Time' "bench/${LABEL}_run2.txt" | awk '{print $3}') \
  <(grep 'Execution Time' "bench/${LABEL}_run3.txt" | awk '{print $3}')
echo; echo "== Main plan nodes (Q1,Q2) =="
grep -E 'Scan|Sort' "bench/${LABEL}_run3.txt" | head -12
