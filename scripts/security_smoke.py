#!/usr/bin/env python3
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


BASE_URL = "http://localhost:4000/api"


def request_json(
    path: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, dict[str, Any]]:
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"

    request = urllib.request.Request(
        urllib.parse.urljoin(BASE_URL + "/", path.lstrip("/")),
        data=None if body is None else json.dumps(body).encode(),
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request) as response:
            payload = response.read().decode()
            if not payload:
                return response.status, {}
            try:
                return response.status, json.loads(payload)
            except json.JSONDecodeError:
                return response.status, {"raw": payload}
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        if not payload:
            return error.code, {}
        try:
            return error.code, json.loads(payload)
        except json.JSONDecodeError:
            return error.code, {"raw": payload}


def assert_status(actual: int, expected: int, context: str) -> None:
    if actual != expected:
        raise RuntimeError(
            f"{context} expected HTTP {expected}, received {actual}"
        )


def login(email: str) -> tuple[str, dict[str, Any]]:
    request_status, request_payload = request_json(
        "/auth/magic-link/request",
        method="POST",
        body={"email": email},
    )
    assert_status(request_status, 201, "magic-link request")
    token = request_payload["token"]

    verify_status, verify_payload = request_json(
        "/auth/magic-link/verify",
        method="POST",
        body={"token": token},
    )
    assert_status(verify_status, 200, "magic-link verify")
    return verify_payload["token"], verify_payload["user"]


def main() -> None:
    timestamp = str(int(time.time()))
    admin_token, _ = login("admin@example.com")
    mod_token, mod_user = login(f"security-mod-{timestamp}@example.com")
    target_token, target_user = login(f"security-target-{timestamp}@example.com")

    role_update_status, _ = request_json(
        f"/users/{mod_user['id']}",
        method="PATCH",
        body={"role": "mod"},
        token=admin_token,
    )
    assert_status(role_update_status, 200, "promote moderator")
    mod_token, _ = login(mod_user["email"])

    anonymous_write_status, _ = request_json(
        "/articles",
        method="POST",
        body={
            "slug": f"security-article-{timestamp}",
            "title": "security",
            "content": "blocked",
            "summary": "n/a",
        },
    )
    assert_status(anonymous_write_status, 401, "anonymous write")

    moderator_ban_status, moderator_ban_payload = request_json(
        "/moderation/actions",
        method="POST",
        token=mod_token,
        body={
            "targetUserId": target_user["id"],
            "actionType": "ban",
            "reasonType": "policy_violation",
            "note": "should fail",
        },
    )
    assert_status(moderator_ban_status, 403, "moderator ban block")

    admin_logs_status, _ = request_json("/admin/logs", token=admin_token)
    assert_status(admin_logs_status, 200, "admin logs access for admin")

    moderator_logs_status, _ = request_json("/admin/logs", token=mod_token)
    assert_status(moderator_logs_status, 403, "admin logs access for moderator")

    _, _ = target_token, moderator_ban_payload
    print(
        json.dumps(
            {
                "anonymousWrite": "blocked",
                "moderatorBan": "blocked",
                "adminLogsAdminAccess": "allowed",
                "adminLogsModeratorAccess": "blocked",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
