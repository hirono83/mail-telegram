#!/bin/bash
# 매일 아침 자동 실행되는 오케스트레이터.
# 1) Mail.app 받은편지함을 JSON으로 내보내고
# 2) 텔레그램 새 메시지를 JSON으로 내보낸 뒤
# 3) 로컬 Claude Code CLI에게 정리/요약/옵시디언 기록을 맡긴다.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

mkdir -p state logs

# .env 로드 (있으면)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

LOG_FILE="logs/run.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG_FILE"
}

log "===== 데일리 에이전트 시작 ====="

# 맥이 절전에서 막 깨어난 직후 launchd가 실행되면 Wi-Fi가 아직 안 붙어있어서
# 텔레그램/Claude API 연결이 매번 실패하는 경우가 있었다. 최대 5분까지 네트워크가
# 붙을 때까지 기다린 뒤 진행한다 (captive.apple.com은 macOS 자체 연결 확인용 엔드포인트).
wait_for_network() {
  local max_wait_seconds=300
  local interval=10
  local waited=0
  while ! curl -fsS -m 5 -o /dev/null "https://captive.apple.com/hotspot-detect.html"; do
    if [ "$waited" -ge "$max_wait_seconds" ]; then
      log "경고: ${max_wait_seconds}초 동안 네트워크 연결을 기다렸지만 실패. 그대로 진행합니다."
      return 1
    fi
    sleep "$interval"
    waited=$((waited + interval))
  done
  if [ "$waited" -gt 0 ]; then
    log "네트워크 연결 확인됨 (${waited}초 대기함)"
  fi
  return 0
}
wait_for_network

log "Mail.app 받은편지함 내보내는 중..."
if ! osascript -l JavaScript scripts/mail/export_inbox.js >state/mail_export.json 2>>"$LOG_FILE"; then
  log "경고: 메일 내보내기 실패. state/mail_export.json이 비어있을 수 있습니다."
  echo '{"exportedAt":null,"count":0,"messages":[],"error":"export_failed"}' >state/mail_export.json
fi

log "텔레그램 새 메시지 가져오는 중..."
PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! "$PYTHON_BIN" scripts/telegram/fetch_messages.py >state/telegram_export.json 2>>"$LOG_FILE"; then
  log "경고: 텔레그램 수집 실패. state/telegram_export.json이 비어있을 수 있습니다."
  echo '{"exportedAt":null,"chats":[],"error":"fetch_failed"}' >state/telegram_export.json
fi

# 실제로 Claude에게 전달되는 프롬프트를 파일로 남겨서, 간헐적으로 빈 응답이 오는 문제가
# 스크립트 쪽(프롬프트가 비어있음)인지 claude CLI 쪽 문제인지 다음번에 바로 판별할 수 있게 한다.
PROMPT_CONTENT="$(cat claude/prompts/daily_report.md)"
echo "$PROMPT_CONTENT" >state/last_prompt_sent.md
log "Claude 프롬프트 길이: ${#PROMPT_CONTENT}자 (state/last_prompt_sent.md에 저장됨)"
if [ "${#PROMPT_CONTENT}" -lt 100 ]; then
  log "경고: 프롬프트가 비정상적으로 짧습니다 (claude/prompts/daily_report.md 확인 필요)."
fi

log "Claude Code 에이전트 실행 중..."
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
if ! "$CLAUDE_BIN" -p "$PROMPT_CONTENT" >>"$LOG_FILE" 2>&1; then
  log "오류: Claude 에이전트 실행 실패"
  exit 1
fi

log "===== 데일리 에이전트 종료 ====="
