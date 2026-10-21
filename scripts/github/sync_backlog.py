"""Create missing labels, milestones and issues from backlog.py. Idempotent.

Usage: python3 scripts/github/sync_backlog.py <owner/repo>   (needs the `gh` CLI, authenticated)
"""

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from backlog import ISSUES, LABELS, MILESTONES  # noqa: E402


def gh(*args, data=None):
    cmd = ["gh", "api", *args]
    if data is not None:
        cmd += ["--input", "-"]
    out = subprocess.run(cmd, input=json.dumps(data) if data is not None else None,
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"gh api {' '.join(args)} failed: {out.stderr.strip()}")
    return json.loads(out.stdout) if out.stdout.strip() else None


def main(repo: str) -> None:
    existing_labels = {l["name"] for l in gh(f"repos/{repo}/labels?per_page=100")}
    for name, (color, desc) in LABELS.items():
        if name not in existing_labels:
            gh(f"repos/{repo}/labels", data={"name": name, "color": color, "description": desc})
            print("label", name)

    ms = {m["title"]: m["number"] for m in gh(f"repos/{repo}/milestones?state=all&per_page=100")}
    for title, desc in MILESTONES:
        if title not in ms:
            ms[title] = gh(f"repos/{repo}/milestones", data={"title": title, "description": desc})["number"]
            print("milestone", title)

    titles = set()
    page = 1
    while True:
        batch = gh(f"repos/{repo}/issues?state=all&per_page=100&page={page}")
        titles |= {i["title"] for i in batch}
        if len(batch) < 100:
            break
        page += 1

    for it in ISSUES:
        if it["title"] in titles:
            continue
        created = gh(f"repos/{repo}/issues", data={
            "title": it["title"], "body": it["body"], "labels": it["labels"], "milestone": ms[it["milestone"]],
        })
        print(f"#{created['number']} {it['title']}")


if __name__ == "__main__":
    main(sys.argv[1])
