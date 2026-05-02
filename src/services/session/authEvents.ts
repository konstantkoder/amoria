import { DeviceEventEmitter } from "react-native";

import type { AuthResponse } from "@/services/api/types";

export const AUTH_SESSION_CHANGED_EVENT = "amoria.authSessionChanged";

export type AuthSessionChangedEvent = {
  signedIn?: boolean;
  authResponse?: AuthResponse;
};

export function emitAuthSessionChanged(event: AuthSessionChangedEvent): void {
  DeviceEventEmitter.emit(AUTH_SESSION_CHANGED_EVENT, event);
}

export function emitAuthUpdated(authResponse: AuthResponse): void {
  emitAuthSessionChanged({ signedIn: true, authResponse });
}

export function emitAuthSignedOut(): void {
  emitAuthSessionChanged({ signedIn: false });
}
