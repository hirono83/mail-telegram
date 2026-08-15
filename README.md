# mail-telegram

맥북 Mail.app과 텔레그램(개인 계정)을 매일 아침 자동으로 훑어서

1. 메일은 안 읽은 것을 일괄 읽음 처리하고, 스팸/광고성만 삭제하고, 나머지는 요약해서 보고하고
2. 텔레그램은 안 읽은 메시지를 일괄 읽음 처리하고, 투자/시장 관련 내용만 골라 인사이트로 정리해서

옵시디언 daily note에 기록하는 개인 자동화 에이전트입니다.

**중요**: 이 저장소는 클라우드가 아니라 **사용자의 맥북에서** 직접 실행되어야 합니다. Mail.app,
텔레그램 개인 계정, 옵시디언 로컬 볼트 모두 사용자의 맥에만 존재하기 때문입니다. 아래 설치 과정을
맥 터미널에서 그대로 따라하세요.

> ⚠️ 이 스캐폴딩은 macOS/Mail.app/Telethon/Obsidian 플러그인이 없는 환경에서 작성되었습니다.
> 특히 `scripts/mail/*.js`(JXA)는 Mail.app 스크립팅 딕셔너리에 의존하므로, 실제 맥에서 한 번씩
> 수동 실행해보고 출력이 기대한 형태인지 반드시 확인한 뒤 자동 스케줄을 등록하세요.

## 요구사항

- macOS + Mail.app (계정 설정 완료된 상태)
- [Claude Code CLI](https://claude.com/claude-code) 설치 및 로그인 완료 (`claude` 명령 사용 가능해야 함)
- Python 3.9+
- [Obsidian](https://obsidian.md) + 커뮤니티 플러그인 [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)
- 텔레그램 계정 + [my.telegram.org](https://my.telegram.org/apps)에서 발급받은 `api_id` / `api_hash`

## 설치

```bash
git clone <이 저장소> ~/mail-telegram   # 또는 원하는 경로
cd ~/mail-telegram
pip3 install -r requirements.txt
cp .env.example .env
```

`.env`를 열어 다음을 채웁니다.

- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` — my.telegram.org에서 발급
- `OBSIDIAN_API_KEY` — 아래 "옵시디언 설정" 참고

## 맥 자동화 권한

`export_inbox.js` / `apply_actions.js`를 처음 실행하면 macOS가 "터미널이 Mail을 제어하려고 합니다"
팝업을 띄웁니다. **허용**을 눌러야 합니다. 이후 언제든 시스템 설정 > 개인정보 보호 및 보안 > 자동화
에서 터미널(또는 launchd가 실제로 사용하는 프로세스)에 Mail 권한이 켜져 있는지 확인할 수 있습니다.

먼저 Mail.app을 실행해두고 수동으로 테스트해보세요.

```bash
osascript -l JavaScript scripts/mail/export_inbox.js | head -c 500
```

JSON이 출력되면 정상입니다. 에러가 나거나 필드가 비어 있으면 `scripts/mail/export_inbox.js`의 속성명
(`dateReceived`, `messageId`, `flaggedStatus` 등)을 실제 macOS 버전의 Mail 스크립팅 딕셔너리에 맞게
조정해야 할 수 있습니다 (Script Editor.app > 파일 > 사전 열기 > Mail 에서 확인 가능).

## 텔레그램 최초 로그인

최초 1회만 대화형으로 실행합니다.

```bash
python3 scripts/telegram/login.py
```

전화번호(국가번호 포함, 예: `+821012345678`) → 인증코드 → (2단계 인증이 켜져 있다면) 비밀번호 순으로
입력하면 `state/telegram.session`이 생성됩니다. 이 파일은 계정 전체에 접근 가능한 민감 정보이니
백업하거나 외부에 공유하지 마세요 (`.gitignore`에 이미 제외되어 있습니다).

이후 실행은 비대화형으로 동작합니다.

```bash
python3 scripts/telegram/fetch_messages.py | head -c 500
```

## 옵시디언 설정

1. Obsidian에서 커뮤니티 플러그인 **Local REST API**를 설치하고 활성화합니다.
2. 플러그인 설정 화면에서 API 키를 복사해 `.env`의 `OBSIDIAN_API_KEY`에 붙여넣습니다.
3. 코어 플러그인 **Daily notes**를 켜고, 설정에 표시된 "새 파일 위치"(폴더)와 "날짜 형식"을
   확인해 `.env`의 `OBSIDIAN_DAILY_FOLDER` / `OBSIDIAN_DAILY_DATE_FORMAT`에 똑같이 맞춥니다.
   (`obsidian_client.py append-daily`는 `/periodic/` 엔드포인트 대신 이 값으로 만든
   `/vault/{폴더}/{날짜}.md` 경로에 직접 append합니다 — Local REST API 플러그인 버전에 따라
   `/periodic/`이 지원되지 않는 경우가 있어 더 안정적인 이 방식을 사용합니다.)
4. Obsidian 앱이 항상 실행 중이어야 합니다 (자동화가 돌 때 꺼져 있으면 기록이 실패합니다).

테스트:

```bash
echo "## 테스트\n연결 확인" | python3 scripts/obsidian/obsidian_client.py append-daily
```

## 수동 테스트 실행

세 가지가 모두 준비되면 오케스트레이터 전체를 한 번 수동으로 돌려봅니다.

```bash
bash scripts/run_daily_agent.sh
tail -f logs/run.log
```

메일함이 실제로 정리되고, 옵시디언 오늘 노트에 브리핑이 추가되는지 확인하세요. 문제가 있으면
`logs/run.log`를 확인합니다.

Claude가 headless(`claude -p`)로 실행되면서 `.claude/settings.json`에 등록되지 않은 도구를 쓰려고
하면 승인 프롬프트가 떠서 자동 실행이 멈출 수 있습니다. 이런 경우가 반복되면 `.claude/settings.json`의
`permissions.allow` 목록에 필요한 명령을 추가하세요.

## 매일 오전 6시 이후 첫 기회에 자동 실행 등록 (launchd)

고정된 시각(예: 매일 06:30)이 아니라, **매일 오전 6시가 지난 뒤 맥이 깨어있는 가장 이른 시점**에
실행되도록 구성되어 있습니다. `scripts/scheduler_check.sh`가 5분마다 조용히 깨어있는지만
확인하다가, "오늘 아직 안 돌았고 오전 6시가 지났다"는 조건이 처음 만족되면 그때
`run_daily_agent.sh`를 한 번 실행합니다. 맥이 절전 중이었다면 깨어난 직후 바로 실행되고,
계속 깨어있었다면 06:00을 넘긴 첫 체크(늦어도 06:05 이내)에 실행됩니다.

1. 템플릿을 실제 plist로 복사한 뒤 `REPO_PATH`를 이 저장소의 실제 절대 경로로, PATH를
   `claude`/`python3`가 실제로 있는 경로로 바꿉니다 (개인 경로가 들어가므로 이 파일은
   `.gitignore`에 의해 git에 커밋되지 않습니다 — 항상 깨끗한 git 상태를 유지하기 위함입니다).

   ```bash
   cp launchd/com.jisthex.mailtelegram.dailyagent.plist.template launchd/com.jisthex.mailtelegram.dailyagent.plist
   sed -i '' "s|REPO_PATH|$HOME/mail-telegram|g" launchd/com.jisthex.mailtelegram.dailyagent.plist
   # claude, python3 위치가 다르다면 PATH도 맞게 수정하세요 (which claude / which python3로 확인)
   ```

2. 파일을 LaunchAgents 폴더에 복사합니다.

   ```bash
   cp launchd/com.jisthex.mailtelegram.dailyagent.plist ~/Library/LaunchAgents/
   ```

3. 등록합니다.

   ```bash
   launchctl load ~/Library/LaunchAgents/com.jisthex.mailtelegram.dailyagent.plist
   ```

4. 즉시 한 번 테스트하고 싶으면:

   ```bash
   launchctl start com.jisthex.mailtelegram.dailyagent
   ```

   (`scheduler_check.sh`가 즉시 실행되긴 하지만, 지금이 오전 6시 이전이거나 오늘 이미 실행됐으면
   조용히 아무 것도 안 하고 끝납니다. 강제로 지금 바로 전체 파이프라인을 돌리고 싶으면
   `bash scripts/run_daily_agent.sh`를 직접 실행하세요.)

이제 매일 오전 6시가 지난 뒤 맥이 깨어있는 첫 순간에 자동으로 실행됩니다. 하루에 한 번만
실행되도록 `state/last_daily_run_date.txt`에 마지막 실행 날짜를 기록해 중복 실행을 막습니다.

등록 해제:

```bash
launchctl unload ~/Library/LaunchAgents/com.jisthex.mailtelegram.dailyagent.plist
```

## 커스터마이징

- **메일 분류/정리 규칙, 옵시디언 기록 포맷**: `claude/prompts/daily_report.md` 수정
- **수집 범위**(메일/텔레그램 처리 상한): `.env`
- **실행 기준 시각**(현재 오전 6시): `scripts/scheduler_check.sh`의 `HOUR_NUM -lt 6` 조건, 체크 주기는 plist의 `StartInterval`
- **보유 종목 목록** (텔레그램 인사이트에서 종목별 섹션으로 따로 분류됨):

  ```bash
  cp config/holdings.example.md config/holdings.md
  ```

  `config/holdings.md`를 열어 한 줄에 종목 하나씩, 이름/별칭/영문명을 쉼표로 구분해 적으세요.
  이 파일은 개인 금융정보라 git에 커밋되지 않습니다. 파일이 없으면 이 기능은 그냥 건너뜁니다.

## 구성

- `scripts/mail/export_inbox.js` — JXA. Mail.app 받은편지함을 `state/mail_export.json`으로 내보냄.
- `scripts/mail/apply_actions.js` — JXA. `state/mail_actions.json`에 적힌 액션(flag/markRead/move/delete)을 Mail.app에 적용.
- `scripts/telegram/login.py` — 최초 1회 대화형 MTProto 로그인 (세션을 `state/telegram.session`에 저장).
- `scripts/telegram/fetch_messages.py` — 저장된 세션으로 새 메시지를 `state/telegram_export.json`으로 내보냄. 체크포인트(`state/telegram_checkpoint.json`)로 중복 수집 방지.
- `scripts/obsidian/obsidian_client.py` — Obsidian Local REST API로 daily note에 기록.
- `scripts/run_daily_agent.sh` — 위 세 가지를 순서대로 실행하고 마지막에 `claude -p`로 실제 정리/요약을 맡기는 오케스트레이터. launchd가 매일 이 스크립트를 호출한다.
- `claude/prompts/daily_report.md` — 오케스트레이터가 headless Claude 실행에 넘기는 지시문.
- `config/holdings.example.md` — 보유 종목 목록 예시 템플릿 (여기서 복사해 만든 `config/holdings.md`는 git에 커밋되지 않음).
- `scripts/scheduler_check.sh` — launchd가 5분마다 호출하는 얇은 체크 스크립트. 오늘 아직 실행 안 했고 오전 6시가 지났을 때만 `run_daily_agent.sh`를 실행한다.
- `launchd/*.plist.template` — 5분마다 `scheduler_check.sh`를 호출하는 스케줄 정의 템플릿 (여기서 복사해 개인 경로를 채운 `.plist`는 git에 커밋되지 않음).
- `state/` — 실행 중 생성되는 JSON/세션 파일 (git 추적 안 함, 민감 정보 포함 가능).
- `logs/` — 실행 로그 (git 추적 안 함).

## 안전 원칙

- **명백한 스팸/광고성 메일만** 삭제(휴지통 이동)됩니다. 조금이라도 애매하면 삭제하지 않고 읽음 처리 후 요약에 포함됩니다.
- 스팸/광고성이 아닌 메일은 절대 삭제되지 않습니다.
- 텔레그램 세션 파일, `.env`, `state/`, `logs/`는 git에 커밋하지 않습니다.

## 문제 해결

- **메일 내보내기가 빈 배열만 반환**: Mail.app 자동화 권한이 꺼져 있거나, Mail 스크립팅 딕셔너리
  속성명이 다를 수 있습니다. Script Editor에서 `tell application "Mail"` 스크립트로 직접 확인하세요.
- **텔레그램 `not_authorized` 에러**: 세션이 만료됨. `python3 scripts/telegram/login.py` 재실행.
- **옵시디언 기록 실패(연결 거부)**: Obsidian 앱이 꺼져 있거나 Local REST API 플러그인이
  비활성화되어 있을 가능성이 큽니다.
- **launchd가 실행되지 않음**: `log show --predicate 'subsystem == "com.apple.xpc.launchd"' --last 1h`
  또는 `logs/launchd.err.log`를 확인하세요. PATH에 `claude`/`python3`/`osascript`가 잡히는지도
  확인이 필요합니다 (launchd는 로그인 셸의 PATH를 상속하지 않습니다).
