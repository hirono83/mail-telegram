# mail-telegram

맥북 Mail.app과 텔레그램(개인 계정)을 매일 아침 자동으로 훑어서, 메일은 안 읽은 것을 일괄 읽음 처리하고
스팸/광고성만 삭제하며, 텔레그램(+메일 속 투자 뉴스레터)의 투자 관련 내용을 통합해서 보유종목/신규
주목종목/시장톤/투자철학/최근추이까지 아우르는 인사이트로 정리해 옵시디언 daily note에 기록하는
개인 자동화 에이전트.

이 저장소 자체는 클라우드가 아니라 **사용자의 맥북에서** launchd로 매일 실행된다. 자세한 설치/운영
방법은 `README.md` 참고.

## 구성

- `scripts/mail/export_inbox.js` — JXA. Mail.app 받은편지함을 `state/mail_export.json`으로 내보냄.
- `scripts/mail/apply_actions.js` — JXA. `state/mail_actions.json`에 적힌 액션(flag/markRead/move/delete)을 Mail.app에 적용.
- `scripts/telegram/login.py` — 최초 1회 대화형 MTProto 로그인 (세션을 `state/telegram.session`에 저장).
- `scripts/telegram/fetch_messages.py` — 저장된 세션으로 새 메시지를 `state/telegram_export.json`으로 내보냄. 체크포인트(`state/telegram_checkpoint.json`)로 중복 수집 방지. 안 읽은 채팅방은 텔레그램 자체에서도 읽음 처리함. 메시지 속 URL은 `links` 필드로 같이 내보냄.
- `scripts/obsidian/obsidian_client.py` — Obsidian Local REST API로 daily note에 기록.
- `scripts/insight_history.py` — 투자 인사이트를 하루 단위로 `state/insight_history.jsonl`에 누적 기록/조회 (최근 추이 비교용, `append`/`recent --days N`).
- `scripts/run_daily_agent.sh` — 위 세 가지를 순서대로 실행하고 마지막에 `claude -p`로 실제 정리/요약을 맡기는 오케스트레이터. launchd가 매일 이 스크립트를 호출한다.
- `claude/prompts/daily_report.md` — `run_daily_agent.sh`가 headless Claude 실행에 넘기는 지시문. 메일 분류 기준, 액션 스키마, 옵시디언 기록 포맷이 정의되어 있음.
- `config/holdings.example.md` — 보유 종목 목록 템플릿. 실제 `config/holdings.md`는 개인 금융정보라 git 추적 안 함.
- `scripts/scheduler_check.sh` — launchd가 5분마다 호출. 오늘 아직 실행 안 했고 오전 6시가 지났을 때만 `run_daily_agent.sh`를 실행 (`state/last_daily_run_date.txt`로 하루 1회 보장).
- `launchd/*.plist.template` — `scheduler_check.sh`를 5분마다 호출하는 스케줄 정의 템플릿 (설치는 README 참고).
- `state/` — 실행 중 생성되는 JSON/세션 파일 (git 추적 안 함, 민감 정보 포함 가능).
- `logs/` — 실행 로그 (git 추적 안 함).

## 데일리 실행이 headless Claude에게 요구하는 것 (요약)

1. `state/mail_export.json`, `state/telegram_export.json` 읽기, `insight_history.py recent`로 최근 추이 조회
2. 메일을 스팸/광고성 vs 그 외로 분류 → 스팸/광고성은 `delete`, 그 외는 `markRead` → `state/mail_actions.json` 작성 → `apply_actions.js`로 적용 (투자 관련 메일은 3번 재료로 넘김)
3. 메일 속 투자 뉴스레터 + 텔레그램 투자 관련 내용을 통합해 보유종목/신규주목종목/시장톤/투자철학/핵심이슈/최근추이로 종합 정리 (중요 링크는 WebFetch로 열어서 반영), `insight_history.py append`로 기록
4. 정해진 포맷으로 옵시디언 daily note에 append (`obsidian_client.py append-daily`)

전체 지시문은 `claude/prompts/daily_report.md`가 원본이므로 규칙을 바꾸고 싶으면 그 파일을 수정한다.

## 안전 원칙

- **명백한 스팸/광고성 메일만** 삭제(휴지통 이동) 가능하다. 조금이라도 애매하면 삭제하지 않고 "그 외"로 분류해 markRead 후 요약에 포함시킨다.
- 스팸/광고성이 아닌 메일은 절대 삭제하지 않는다.
- 텔레그램 세션 파일, `.env`, `state/`, `logs/`는 git에 커밋하지 않는다.
