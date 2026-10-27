"""Check tracked content without printing sensitive values; uses only stdlib."""

from __future__ import annotations

import argparse
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], encoding="utf-8").strip())
IPV4 = re.compile(rb"(?<![\w.])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![\w.])")
KEY = re.compile(rb"\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|AKIA[A-Z0-9]{16})\b")
PRIVATE_KEY = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")
HOME_PATH = re.compile(rb"(?i)\b[A-Z]:[\\/]+Users[\\/]+[^\\/\s\x22\x27]+|/" + rb"Users/[^/\s\x22\x27]+")
EXAMPLES = [ipaddress.ip_network(value) for value in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")]
LOCAL_ROOTS = ("scripts/", "data/", "output/", "outputs/", ".claude/", ".playwright-cli/")


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT)


def private_path(path: str) -> bool:
    parts = Path(path).parts
    name = parts[-1]
    return (
        path.startswith(LOCAL_ROOTS)
        or (path.startswith("web/deploy/") and not path.startswith("web/deploy/examples/"))
        or any(part in {"node_modules", "browser_data", ".auth"} or part.startswith(".next") for part in parts)
        or (name.startswith(".env") and not name.endswith(".example"))
        or name == ".privacy-local.json"
        or name.endswith((".db", ".db-wal", ".db-shm", ".pem", ".key"))
    )


def blocked_values() -> list[bytes]:
    values: set[bytes] = set()
    local = ROOT / ".privacy-local.json"
    if local.exists():
        for value in json.loads(local.read_text(encoding="utf-8")).get("blocked_strings", []):
            if len(value) >= 8:
                values.add(value.encode())
    for relative in (".env", ".env.local", "web/.env", "web/.env.local"):
        path = ROOT / relative
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip("\"'")
            if re.search(r"KEY|SECRET|TOKEN|PASSWORD|COOKIE", key, re.I) and len(value) >= 10:
                values.add(value.encode())
    return sorted(values)


def entries(staged: bool, history: bool) -> list[tuple[str, str]]:
    result: set[tuple[str, str]] = set()
    if staged:
        lines = git("ls-files", "--stage", "-z").split(b"\0")
    else:
        commits = git("rev-list", "--all").decode().splitlines() if history else ["HEAD"]
        lines = [line for commit in commits for line in git("ls-tree", "-rz", commit).split(b"\0")]
    for line in filter(None, lines):
        metadata, name = line.split(b"\t", 1)
        mode, sha, _stage = metadata.split() if staged else (metadata.split()[0], metadata.split()[2], b"0")
        if mode == b"160000":
            continue
        result.add((sha.decode(), name.decode()))
    return sorted(result)


def inspect(staged: bool, history: bool) -> dict:
    values = blocked_values()
    findings = []
    checked = 0
    process = subprocess.Popen(["git", "cat-file", "--batch"], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for sha, path in entries(staged, history):
            process.stdin.write((sha + "\n").encode())
            process.stdin.flush()
            header = process.stdout.readline().split()
            size = int(header[2])
            data = process.stdout.read(size)
            process.stdout.read(1)
            checked += 1
            rules = set()
            if private_path(path):
                rules.add("local_only_path")
            if any(value in data for value in values):
                rules.add("local_private_value")
            if KEY.search(data) or PRIVATE_KEY.search(data):
                rules.add("credential")
            # School sources and vendored upstream examples can contain public
            # IPs and paths. Exact local private values are still checked above.
            reference = path.startswith(("web/knowledge/", "crawlers/MediaCrawler/"))
            if b"\0" not in data and not reference:
                if HOME_PATH.search(data):
                    rules.add("personal_home_path")
                for match in IPV4.finditer(data):
                    try:
                        address = ipaddress.ip_address(match.group().decode())
                    except ValueError:
                        continue
                    if address.is_loopback or address.is_unspecified or any(address in network for network in EXAMPLES):
                        continue
                    rules.add("non_example_ip")
            if rules:
                findings.append({"path": path, "rules": sorted(rules)})
    finally:
        process.stdin.close()
        process.wait()
    return {"checked_file_versions": checked, "finding_count": len(findings), "findings": findings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true", help="Check the Git index, without scanning untracked local files.")
    mode.add_argument("--history", action="store_true", help="Check all file versions reachable from local refs.")
    options = parser.parse_args()
    report = inspect(options.staged, options.history)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["finding_count"] else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
