import { apiRequest } from "@/services/api/apiClient";

export function deleteMyAccount(password: string): Promise<{ status: "pending" | "completed" }> {
  return apiRequest("/me/account", { method: "DELETE", body: { password } });
}
