import type { Role } from "./common";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  activeRole: Role;
  campusName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  campusCode: string;
}
