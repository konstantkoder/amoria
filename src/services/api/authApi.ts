import { apiRequest } from "@/services/api/apiClient";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "@/services/api/types";

export function registerWithBackend(input: RegisterRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: input,
  });
}

export function loginWithBackend(input: LoginRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: input,
  });
}
