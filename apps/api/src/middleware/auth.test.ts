import { describe, expect, it, vi } from "vitest";
import { requireRole } from "./auth.js";
import type { AuthedRequest } from "../types.js";

const createResponseMock = () => {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  return response;
};

describe("requireRole", () => {
  it("blocks unauthorized roles", () => {
    const middleware = requireRole(["admin"]);
    const req = {
      user: {
        id: 4,
        email: "editor@example.com",
        role: "editor",
        status: "active",
      },
    } as unknown as AuthedRequest;

    const res = createResponseMock();
    const next = vi.fn();

    middleware(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows authorized roles", () => {
    const middleware = requireRole(["admin"]);
    const req = {
      user: {
        id: 1,
        email: "admin@example.com",
        role: "admin",
        status: "active",
      },
    } as unknown as AuthedRequest;

    const res = createResponseMock();
    const next = vi.fn();

    middleware(req, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
