#!/usr/bin/env python3
"""Read-only RustChain status client for public miner IDs."""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


def fetch_once(url: str, *, parse_json: bool) -> dict:
    request = Request(url, headers={"User-Agent": "rustchain-status-client/1.0"})
    try:
        with urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8", errors="replace")
            result = {"ok": True, "status": response.status, "url": url}
            result["body"] = json.loads(body) if parse_json else body[:160]
            return result
    except HTTPError as exc:
        return {"ok": False, "status": exc.code, "url": url, "error": str(exc)}
    except (URLError, TimeoutError) as exc:
        return {"ok": False, "status": None, "url": url, "error": str(exc)}


def fetch(url: str, *, parse_json: bool, attempts: int = 3) -> dict:
    last = None
    for attempt in range(1, attempts + 1):
        result = fetch_once(url, parse_json=parse_json)
        result["attempt"] = attempt
        if result["ok"]:
            return result
        last = result
        time.sleep(0.5 * attempt)
    return last or {"ok": False, "status": None, "url": url, "error": "not attempted"}


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} MINER_ID", file=sys.stderr)
        return 2

    miner_id = sys.argv[1]
    encoded = quote(miner_id, safe="")
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "miner_id": miner_id,
        "site": fetch("https://rustchain.org/", parse_json=False),
        "balance": fetch(
            f"https://rustchain.org/wallet/balance?miner_id={encoded}",
            parse_json=True,
        ),
        "history": fetch(
            f"https://rustchain.org/wallet/history?miner_id={encoded}",
            parse_json=True,
        ),
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["site"]["ok"] and report["balance"]["ok"] and report["history"]["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
