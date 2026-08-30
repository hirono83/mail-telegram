#!/usr/bin/env python3
"""텔레그램/메일에서 뽑아낸 투자 인사이트를 하루 단위로 누적 기록/조회하는 CLI.

state/insight_history.jsonl 에 하루 한 줄씩 JSON을 append한다 (JSON Lines 형식).
daily_report.md가 오늘 인사이트를 종합한 뒤 이 스크립트로 기록해두고, 다음 실행부터는
최근 며칠치를 다시 읽어와서 "최근 추이" 비교에 사용한다.

기록 항목의 형식은 daily_report.md가 결정한다 (이 스크립트는 형식을 강제하지 않고 그대로
저장/조회만 한다). 대략 다음과 같은 형태를 기대한다:

  {
    "date": "2026-08-17",           (미지정시 오늘 날짜로 자동 채워짐)
    "themes": ["반도체 슈퍼사이클", ...],
    "tickers": {"삼성전자": 3, "SK하이닉스": 5},
    "watchlist_candidates": ["산일전기"],
    "sentiment": "강세"
  }

사용법:
  echo '{"themes": [...], ...}' | python3 scripts/insight_history.py append
  python3 scripts/insight_history.py recent --days 7
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_DIR = os.path.join(BASE_DIR, "state")
HISTORY_PATH = os.path.join(STATE_DIR, "insight_history.jsonl")


def cmd_append(_args):
    raw = sys.stdin.read()
    try:
        entry = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"status": "error", "error": f"invalid JSON: {e}"}))
        sys.exit(1)

    entry.setdefault("date", datetime.now().strftime("%Y-%m-%d"))

    os.makedirs(STATE_DIR, exist_ok=True)
    with open(HISTORY_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(json.dumps({"status": "ok", "date": entry["date"]}, ensure_ascii=False))


def cmd_recent(args):
    if not os.path.exists(HISTORY_PATH):
        print("[]")
        return

    cutoff = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
    entries = []
    with open(HISTORY_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("date", "") >= cutoff:
                entries.append(entry)

    print(json.dumps(entries, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("append", help="stdin으로 받은 JSON을 오늘자 기록으로 append")

    p_recent = sub.add_parser("recent", help="최근 N일치 기록을 JSON 배열로 출력")
    p_recent.add_argument("--days", type=int, default=7)

    args = parser.parse_args()

    if args.cmd == "append":
        cmd_append(args)
    elif args.cmd == "recent":
        cmd_recent(args)


if __name__ == "__main__":
    main()
