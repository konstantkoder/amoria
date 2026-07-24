import type { TurnBasedMomentDto, TurnBasedMomentResponse } from "./api/types";

export async function refreshTurnBasedFlow(input: {
  getCurrent: () => Promise<TurnBasedMomentResponse>;
  setMoment: (moment: TurnBasedMomentDto | null) => void;
  routeMoment?: (moment: TurnBasedMomentDto) => void;
  onError?: (error: unknown) => void;
}): Promise<TurnBasedMomentDto | null> {
  try {
    const response = await input.getCurrent();
    input.setMoment(response.moment);
    if (response.moment && input.routeMoment) input.routeMoment(response.moment);
    return response.moment;
  } catch (error) {
    input.onError?.(error);
    return null;
  }
}

export function shouldRenewPartnerLease(input: {
  moment: TurnBasedMomentDto | null;
  focused: boolean;
  appActive: boolean;
}): boolean {
  return Boolean(
    input.focused &&
    input.appActive &&
    input.moment?.role === "partner" &&
    input.moment.status === "partner_turn"
  );
}

export function turnBasedRouteParams(sessionId:string,momentId:string) {
  return { sessionId, mode:"turn_based" as const, momentId };
}

export function identityMayBeShown(
  moment: Pick<TurnBasedMomentDto,"identityRevealed"> | null,
  sessionIdentityRevealed: boolean,
): boolean {
  return Boolean(moment?.identityRevealed && sessionIdentityRevealed);
}

export async function dismissTurnBasedFlow(input: {
  momentId: string;
  dismiss: (id:string) => Promise<unknown>;
  setMoment: (moment:null) => void;
}): Promise<void> {
  await input.dismiss(input.momentId);
  input.setMoment(null);
}
