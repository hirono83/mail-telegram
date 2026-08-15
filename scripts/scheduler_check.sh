#!/bin/bash
# launchd가 짧은 주기(StartInterval)로 이 스크립트를 반복 호출한다.
# "오늘 아직 실행 안 했고, 오전 6시가 지났다"는 조건이 처음 만족되는 순간에만
# run_daily_agent.sh를 실행한다 — 맥이 절전 중이었다면 깨어난 뒤 가장 먼저 도는
# 체크에서 바로 실행되고, 계속 깨어있었다면 06:00을 넘긴 첫 체크에서 실행된다.
# 같은 날 이미 실행했으면 그냥 조용히 종료한다 (중복 실행 방지).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

mkdir -p state logs

MARKER_FILE="state/last_daily_run_date.txt"
TODAY="$(date '+%Y-%m-%d')"
HOUR="$(date '+%H')"
HOUR_NUM=$((10#$HOUR)) # %H는 08, 09처럼 0으로 시작해 bash가 8진수로 오해할 수 있어 10진수로 강제 변환

LAST_RUN="$(cat "$MARKER_FILE" 2>/dev/null || echo "")"

if [ "$LAST_RUN" = "$TODAY" ]; then
  exit 0
fi

if [ "$HOUR_NUM" -lt 6 ]; then
  exit 0
fi

echo "$TODAY" >"$MARKER_FILE"
exec bash scripts/run_daily_agent.sh
