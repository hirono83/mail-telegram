#!/usr/bin/env python3
"""텔레그램 개인 계정(MTProto) 최초 로그인용 스크립트.

최초 1회만 대화형으로 실행합니다. 전화번호 -> 인증코드 -> (2단계 인증이 켜져 있다면) 비밀번호
순으로 입력을 요구하며, 성공하면 state/telegram.session 파일에 세션이 저장됩니다.
이후 fetch_messages.py는 이 세션 파일로 비대화형 로그인합니다.

세션 파일은 텔레그램 계정 전체에 접근 가능한 민감 정보이므로 절대 git에 커밋하지 마세요
(.gitignore에 이미 제외되어 있습니다).

사용법 (레포 루트에서):
    pip3 install -r requirements.txt
    python3 scripts/telegram/login.py
"""
import os

from dotenv import load_dotenv
from telethon.sync import TelegramClient

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE_DIR = os.path.join(BASE_DIR, "state")
SESSION_PATH = os.path.join(STATE_DIR, "telegram")

os.makedirs(STATE_DIR, exist_ok=True)

api_id = os.environ.get("TELEGRAM_API_ID")
api_hash = os.environ.get("TELEGRAM_API_HASH")

if not api_id or not api_hash:
    raise SystemExit(
        "TELEGRAM_API_ID / TELEGRAM_API_HASH가 설정되지 않았습니다.\n"
        "https://my.telegram.org/apps 에서 발급받아 .env에 채워주세요."
    )

with TelegramClient(SESSION_PATH, int(api_id), api_hash) as client:
    me = client.get_me()
    print(f"로그인 성공: {me.first_name} (@{me.username})")
    print(f"세션 저장 위치: {SESSION_PATH}.session")
