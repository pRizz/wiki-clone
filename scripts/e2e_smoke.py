#!/usr/bin/env python3
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class SmokeConfig:
    base_url: str = "http://localhost:4000/api"


def request_json(
    config: SmokeConfig,
    path: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> dict[str, Any]:
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"

    payload = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        urllib.parse.urljoin(config.base_url + "/", path.lstrip("/")),
        data=payload,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request) as response:
            maybe_content = response.read().decode()
            return json.loads(maybe_content) if maybe_content else {}
    except urllib.error.HTTPError as error:
        maybe_payload = error.read().decode()
        raise RuntimeError(
            f"HTTP {error.code} on {path}: {maybe_payload or error.reason}"
        ) from error


def run() -> None:
    config = SmokeConfig()
    timestamp = str(int(time.time()))
    editor_email = f"smoke-editor-{timestamp}@example.com"
    slug = f"smoke-article-{timestamp}"

    admin_request = request_json(
        config,
        "/auth/magic-link/request",
        method="POST",
        body={"email": "admin@example.com"},
    )
    admin_auth = request_json(
        config,
        "/auth/magic-link/verify",
        method="POST",
        body={"token": admin_request["token"]},
    )
    admin_token = admin_auth["token"]

    editor_request = request_json(
        config,
        "/auth/magic-link/request",
        method="POST",
        body={"email": editor_email},
    )
    editor_auth = request_json(
        config,
        "/auth/magic-link/verify",
        method="POST",
        body={"token": editor_request["token"]},
    )
    editor_token = editor_auth["token"]
    editor_user = editor_auth["user"]

    article = request_json(
        config,
        "/articles",
        method="POST",
        token=editor_token,
        body={
            "slug": slug,
            "title": f"Smoke Article {timestamp}",
            "content": "line 1\nline 2",
            "summary": "initial",
        },
    )
    request_json(
        config,
        f"/articles/{slug}",
        method="PUT",
        token=editor_token,
        body={
            "content": "line 1\nline 2 updated\nline 3",
            "summary": "expanded",
        },
    )
    history = request_json(config, f"/articles/{slug}/history")
    diff = request_json(config, f"/articles/{slug}/diff")

    thread = request_json(
        config,
        f"/articles/{slug}/discussions",
        method="POST",
        token=editor_token,
        body={"title": "Talk thread"},
    )
    comment = request_json(
        config,
        f"/discussions/{thread['thread']['id']}/comments",
        method="POST",
        token=editor_token,
        body={"content": "Comment body"},
    )

    newest_revision_id = history["revisions"][0]["id"]
    request_json(
        config,
        "/votes",
        method="POST",
        token=admin_token,
        body={
            "targetType": "revision",
            "targetId": newest_revision_id,
            "value": 1,
        },
    )
    request_json(
        config,
        "/votes",
        method="POST",
        token=admin_token,
        body={
            "targetType": "comment",
            "targetId": comment["comment"]["id"],
            "value": 1,
        },
    )
    moderation = request_json(
        config,
        "/moderation/actions",
        method="POST",
        token=admin_token,
        body={
            "targetUserId": editor_user["id"],
            "actionType": "warn",
            "reasonType": "policy_violation",
            "note": "smoke warning",
        },
    )
    search = request_json(config, f"/search?query={urllib.parse.quote(slug)}")
    karma = request_json(config, f"/karma/users/{editor_user['id']}")

    summary = {
      "slug": slug,
      "articleId": article["article"]["id"],
      "revisionCount": len(history["revisions"]),
      "diffLineCount": len(diff["lines"]),
      "threadId": thread["thread"]["id"],
      "commentId": comment["comment"]["id"],
      "moderationActionId": moderation["action"]["id"],
      "searchResults": len(search["results"]),
      "karmaTotal": karma["totals"]["total"],
      "ledgerEntries": len(karma["ledger"]),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    run()
