# mail-telegram

맥북 Mail.app과 텔레그램(개인 계정)을 매일 아침 자동으로 훑어서, 메일은 안 읽은 것을 일괄 읽음 처리하고
스팸/광고성만 삭제하며, 텔레그램은 투자 관련 내용만 인사이트로 정리해서 옵시디언 daily note에
기록하는 개인 자동화 에이전트.

이 저장소 자체는 클라우드가 아니라 **사용자의 맥북에서** launchd로 매일 실행된다. 자세한 설치/운영
방법은 `README.md` 참고.

## 구성

- `scripts/mail/export_inbox.js` — JXA. Mail.app 받은편지함을 `state/mail_export.json`으로 내보냄.
- `scripts/mail/apply_actions.js` — JXA. `state/mail_actions.json`에 적힌 액션(flag/markRead/move/delete)을 Mail.app에 적용.
- `scripts/telegram/login.py` — 최초 1회 대화형 MTProto 로그인 (세션을 `state/telegram.session`에 저장).
- `scripts/telegram/fetch_messages.py` — 저장된 세션으로 새 메시지를 `state/telegram_export.json`으로 내보냄. 체크포인트(`state/telegram_checkpoint.json`)로 중복 수집 방지. 안 읽은 채팅방은 텔레그램 자체에서도 읽음 처리함.
- `scripts/obsidian/obsidian_client.py` — Obsidian Local REST API로 daily note에 기록.
- `scripts/run_daily_agent.sh` — 위 세 가지를 순서대로 실행하고 마지막에 `claude -p`로 실제 정리/요약을 맡기는 오케스트레이터. launchd가 매일 이 스크립트를 호출한다.
- `claude/prompts/daily_report.md` — `run_daily_agent.sh`가 headless Claude 실행에 넘기는 지시문. 메일 분류 기준, 액션 스키마, 옵시디언 기록 포맷이 정의되어 있음.
- `launchd/*.plist.template` — 매일 06:30 실행 스케줄 정의 템플릿 (설치는 README 참고).
- `state/` — 실행 중 생성되는 JSON/세션 파일 (git 추적 안 함, 민감 정보 포함 가능).
- `logs/` — 실행 로그 (git 추적 안 함).

## 데일리 실행이 headless Claude에게 요구하는 것 (요약)

1. `state/mail_export.json`, `state/telegram_export.json` 읽기
2. 메일을 스팸/광고성 vs 그 외로 분류 → 스팸/광고성은 `delete`, 그 외는 `markRead` → `state/mail_actions.json` 작성 → `apply_actions.js`로 적용
3. 텔레그램 메시지 중 투자/시장 관련 내용만 골라 종합 인사이트로 정리
4. 정해진 포맷으로 옵시디언 daily note에 append (`obsidian_client.py append-daily`)

전체 지시문은 `claude/prompts/daily_report.md`가 원본이므로 규칙을 바꾸고 싶으면 그 파일을 수정한다.

## 안전 원칙

- **명백한 스팸/광고성 메일만** 삭제(휴지통 이동) 가능하다. 조금이라도 애매하면 삭제하지 않고 "그 외"로 분류해 markRead 후 요약에 포함시킨다.
- 스팸/광고성이 아닌 메일은 절대 삭제하지 않는다.
- 텔레그램 세션 파일, `.env`, `state/`, `logs/`는 git에 커밋하지 않는다.
