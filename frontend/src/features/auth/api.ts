import {
  SessionResponse,
  type LoginRequest,
  type RegisterRequest,
  type ChangePasswordRequest,
  type UpdateProfileRequest,
} from '@nexusai/contracts';
import { empty, json } from '@/lib/http';

export const login = (body: LoginRequest) =>
  json('/auth/login', SessionResponse, { method: 'POST', body });

export const register = (body: RegisterRequest) =>
  json('/auth/register', SessionResponse, { method: 'POST', body });

export const me = () => json('/auth/me', SessionResponse);

export const logout = () => empty('/auth/logout', { method: 'POST' });

export const updateProfile = (body: UpdateProfileRequest) =>
  json('/auth/me', SessionResponse, { method: 'PATCH', body });

export const changePassword = (body: ChangePasswordRequest) =>
  empty('/auth/password', { method: 'POST', body });
