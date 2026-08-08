#!/usr/bin/env python3
"""Obsidian Local REST API 플러그인을 통해 노트를 쓰는 CLI 유틸리티.

사전 준비:
  - Obsidian이 실행 중이어야 합니다.
  - 커뮤니티 플러그인 "Local REST API" (coddingtonbear/obsidian-local-rest-api) 설치 + 활성화.
  - 플러그인 설정에서 API 키를 발급받아 .env의 OBSIDIAN_API_KEY에 채워야 합니다.
  - 오늘 노트(daily note) 기능을 쓰려면 Obsidian 코어 "Daily notes" 플러그인 또는
    "Periodic Notes" 플러그인이 활성화되어 있어야 합니다.
  - 플러그인은 자체 서명 인증서로 HTTPS를 서비스하므로 verify=False로 호출합니다
    (로컬호스트 전용 통신이므로 허용).

사용법:
  python3 obsidian_client.py append-daily --file report.md
  echo "내용" | python3 obsidian_client.py append-daily
  python3 obsidian_client.py put --path "Inbox/note.md" --file note.md
"""
import argparse
import json
import os
import sys

import requests
import urllib3
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv()

API_URL = os.environ.get("OBSIDIAN_API_URL", "https://127.0.0.1:27124").rstrip("/")
API_KEY = os.environ.get("OBSIDIAN_API_KEY")


def _headers(content_type="text/markdown"):
    if not API_KEY:
        raise SystemExit("OBSIDIAN_API_KEY가 설정되지 않았습니다 (.env 확인)")
    return {"Authorization": f"Bearer {API_KEY}", "Content-Type": content_type}


def append_daily(content: str) -> str:
    """오늘 날짜의 daily note 끝에 content를 추가한다 (없으면 템플릿대로 생성 후 추가)."""
    url = f"{API_URL}/periodic/daily/"
    resp = requests.post(url, headers=_headers(), data=content.encode("utf-8"), verify=False, timeout=15)
    resp.raise_for_status()
    return "periodic/daily"


def put_note(path: str, content: str) -> str:
    """지정한 경로의 노트를 생성하거나 전체 내용을 덮어쓴다."""
    url = f"{API_URL}/vault/{path}"
    resp = requests.put(url, headers=_headers(), data=content.encode("utf-8"), verify=False, timeout=15)
    resp.raise_for_status()
    return path


def append_note(path: str, content: str) -> str:
    """지정한 경로의 기존 노트 끝에 내용을 추가한다."""
    url = f"{API_URL}/vault/{path}"
    resp = requests.post(url, headers=_headers(), data=content.encode("utf-8"), verify=False, timeout=15)
    resp.raise_for_status()
    return path


def _read_input(args):
    if getattr(args, "file", None):
        with open(args.file, encoding="utf-8") as f:
            return f.read()
    return sys.stdin.read()


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("append-daily", help="오늘 daily note 끝에 추가")
    p1.add_argument("--file", help="내용을 읽어올 파일 (미지정시 stdin)")

    p2 = sub.add_parser("put", help="특정 경로 노트 생성/덮어쓰기")
    p2.add_argument("--path", required=True)
    p2.add_argument("--file")

    p3 = sub.add_parser("append", help="특정 경로 노트 끝에 추가")
    p3.add_argument("--path", required=True)
    p3.add_argument("--file")

    args = parser.parse_args()
    content = _read_input(args)

    try:
        if args.cmd == "append-daily":
            path = append_daily(content)
        elif args.cmd == "put":
            path = put_note(args.path, content)
        elif args.cmd == "append":
            path = append_note(args.path, content)
        else:
            raise SystemExit(f"unknown command: {args.cmd}")
    except requests.exceptions.RequestException as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)

    print(json.dumps({"status": "ok", "path": path}, ensure_ascii=False))


if __name__ == "__main__":
    main()
