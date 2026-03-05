import type { Request } from "express";
import type { Role, UserStatus } from "@wiki/shared";

export type SessionUser = {
  id: number;
  email: string;
  role: Role;
  status: UserStatus;
};

export type AuthedRequest = Request & {
  user?: SessionUser;
};
