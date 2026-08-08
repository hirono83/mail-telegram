#!/usr/bin/env python3
"""저장된 세션으로 텔레그램 새 메시지를 비대화형으로 수집해 JSON을 stdout에 출력.

각 채팅방(dialog)별로 마지막으로 읽은 메시지 id를 state/telegram_checkpoint.json에 저장해두고,
다음 실행부터는 그 이후 메시지만 가져옵니다 (중복 수집 방지). 체크포인트가 없는 채팅방은
TELEGRAM_LOOKBACK_HOURS 만큼만 거슬러 올라갑니다.

사용법:
    python3 fetch_messages.py > state/telegram_export.json

사전 준비: login.py를 먼저 한 번 실행해 세션을 만들어둬야 합니다.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from telethon.sync import TelegramClient

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE_DIR = os.path.join(BASE_DIR, "state")
SESSION_PATH = os.path.join(STATE_DIR, "telegram")
CHECKPOINT_PATH = os.path.join(STATE_DIR, "telegram_checkpoint.json")

api_id = os.environ.get("TELEGRAM_API_ID")
api_hash = os.environ.get("TELEGRAM_API_HASH")
lookback_hours = int(os.environ.get("TELEGRAM_LOOKBACK_HOURS", "24"))
max_per_chat = int(os.environ.get("TELEGRAM_MAX_PER_CHAT", "200"))

if not api_id or not api_hash:
    print(json.dumps({"error": "missing_config", "message": "TELEGRAM_API_ID / TELEGRAM_API_HASH가 없습니다."}))
    sys.exit(1)

if not os.path.exists(SESSION_PATH + ".session"):
    print(json.dumps({"error": "no_session", "message": "먼저 login.py를 실행해 로그인하세요."}))
    sys.exit(1)

os.makedirs(STATE_DIR, exist_ok=True)

checkpoint = {}
if os.path.exists(CHECKPOINT_PATH):
    with open(CHECKPOINT_PATH, encoding="utf-8") as f:
        checkpoint = json.load(f)

client = TelegramClient(SESSION_PATH, int(api_id), api_hash)
client.connect()

if not client.is_user_authorized():
    print(json.dumps({"error": "not_authorized", "message": "세션이 만료되었습니다. login.py를 다시 실행하세요."}))
    sys.exit(1)

cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
chats_out = []

for dialog in client.iter_dialogs():
    chat_id = str(dialog.id)
    last_seen_id = checkpoint.get(chat_id, {}).get("last_message_id", 0)

    messages = []
    newest_id = last_seen_id
    for msg in client.iter_messages(dialog.entity, limit=max_per_chat):
        if msg.id <= last_seen_id:
            break
        if msg.date < cutoff:
            break
        text = msg.message or ""
        if not text:
            continue
        sender_name = None
        try:
            sender = msg.sender
            sender_name = getattr(sender, "first_name", None) or getattr(sender, "title", None)
        except Exception:
            pass
        messages.append(
            {
                "id": msg.id,
                "date": msg.date.isoformat(),
                "sender": sender_name or str(msg.sender_id),
                "text": text,
                "outgoing": bool(msg.out),
            }
        )
        newest_id = max(newest_id, msg.id)

    if messages:
        messages.reverse()  # 오래된 순으로 정렬
        chats_out.append(
            {
                "chatId": chat_id,
                "chatName": dialog.name,
                "isGroup": bool(dialog.is_group),
                "isChannel": bool(dialog.is_channel),
                "messages": messages,
            }
        )
        checkpoint[chat_id] = {
            "last_message_id": newest_id,
            "last_synced": datetime.now(timezone.utc).isoformat(),
        }

with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
    json.dump(checkpoint, f, ensure_ascii=False, indent=2)

print(
    json.dumps(
        {"exportedAt": datetime.now(timezone.utc).isoformat(), "chats": chats_out},
        ensure_ascii=False,
    )
)

client.disconnect()
