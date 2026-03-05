#!/usr/bin/env python3
import json
import math
import statistics
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
            return response.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        return error.code, json.loads(payload) if payload else {}


def login(email: str) -> tuple[str, dict[str, Any]]:
    request_status, request_payload = request_json(
        "/auth/magic-link/request",
        method="POST",
        body={"email": email},
    )
    if request_status != 201:
        raise RuntimeError(f"magic-link request failed for {email}: {request_status}")

    verify_status, verify_payload = request_json(
        "/auth/magic-link/verify",
        method="POST",
        body={"token": request_payload["token"]},
    )
    if verify_status != 200:
        raise RuntimeError(f"magic-link verify failed for {email}: {verify_status}")

    return verify_payload["token"], verify_payload["user"]


def percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0

    k = (len(sorted_values) - 1) * pct
    floor_index = math.floor(k)
    ceil_index = math.ceil(k)
    if floor_index == ceil_index:
        return sorted_values[floor_index]

    lower = sorted_values[floor_index]
    upper = sorted_values[ceil_index]
    return lower + (upper - lower) * (k - floor_index)


def main() -> None:
    run_count = 30
    timestamp = str(int(time.time()))
    email = f"edit-latency-{timestamp}@example.com"
    slug = f"edit-latency-{timestamp}"

    token, _user = login(email)

    create_status, _create_payload = request_json(
        "/articles",
        method="POST",
        token=token,
        body={
            "slug": slug,
            "title": f"Edit Latency {timestamp}",
            "content": "base content",
            "summary": "initial",
        },
    )
    if create_status != 201:
        raise RuntimeError(f"article create failed: {create_status}")

    latencies_ms: list[float] = []
    for index in range(run_count):
        started_at = time.perf_counter()
        edit_status, _edit_payload = request_json(
            f"/articles/{slug}",
            method="PUT",
            token=token,
            body={
                "content": f"base content\nedit iteration {index}",
                "summary": f"iteration-{index}",
            },
        )
        ended_at = time.perf_counter()
        if edit_status != 200:
            raise RuntimeError(f"edit iteration {index} failed: {edit_status}")

        latencies_ms.append((ended_at - started_at) * 1000)

    sorted_latencies = sorted(latencies_ms)
    summary = {
        "runs": run_count,
        "meanMs": round(statistics.fmean(latencies_ms), 2),
        "p50Ms": round(percentile(sorted_latencies, 0.50), 2),
        "p95Ms": round(percentile(sorted_latencies, 0.95), 2),
        "maxMs": round(max(latencies_ms), 2),
        "slug": slug,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
