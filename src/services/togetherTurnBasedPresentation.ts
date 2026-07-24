import type { TurnBasedAction } from "@/services/api/types";

export type TurnBasedCardPresentation = {
  titleKey: string;
  titleFallback: string;
  bodyKey?: string;
  bodyFallback?: string;
  primaryKey?: string;
  primaryFallback?: string;
  refresh: boolean;
  cancel: boolean;
  dismiss: boolean;
  startNew: boolean;
};

export function turnBasedCardPresentation(action: TurnBasedAction | null): TurnBasedCardPresentation {
  switch (action) {
    case "start_draw":
      return state("start_draw", "Start a shared drawing", "Start drawing");
    case "resume_draw":
      return state("resume_draw", "Your drawing is not finished", "Continue");
    case "waiting_for_partner":
      return waiting("waiting_for_partner", "Looking for someone to continue", "Your beginning is waiting for the right person.", true);
    case "continue_draw":
      return state("continue_draw", "Your turn", "Continue drawing", "Someone started a drawing. Continue it with your part.");
    case "review_draw":
      return state("review_draw", "The drawing is ready", "View the result");
    case "waiting_for_draw_decision":
      return waiting("waiting_for_draw_decision", "Waiting for the other person's decision");
    case "continue_story":
      return state("continue_story", "Your turn in the story", "Continue the story");
    case "waiting_for_story_turn":
      return waiting("waiting_for_story_turn", "The story continues", "It is the other person's turn.");
    case "review_story":
      return state("review_story", "The story is ready", "View the result");
    case "waiting_for_story_decision":
      return waiting("waiting_for_story_decision", "Waiting for the other person's decision");
    case "completed":
      return terminal("completed", "Moment completed", false);
    case "expired":
      return terminal("expired", "This moment has expired", true);
    case "cancelled":
      return terminal("cancelled", "Moment cancelled", true);
    case "blocked":
      return terminal("blocked", "Moment closed", false);
    case "reported":
      return terminal("reported", "Moment temporarily unavailable", false);
    default:
      return {
        titleKey: "together.turnBased.title",
        titleFallback: "Together in turns",
        bodyKey: "together.turnBased.body",
        bodyFallback: "Start now. Another person will continue when they can.",
        primaryKey: "together.turnBased.start",
        primaryFallback: "Start in turns",
        refresh: false,
        cancel: false,
        dismiss: false,
        startNew: false,
      };
  }
}

function state(id:string,title:string,primary:string,body?:string):TurnBasedCardPresentation {
  return {
    titleKey:`together.turnBased.${id}.title`,titleFallback:title,
    ...(body ? {bodyKey:`together.turnBased.${id}.body`,bodyFallback:body} : {}),
    primaryKey:`together.turnBased.${id}.primary`,primaryFallback:primary,
    refresh:false,cancel:false,dismiss:false,startNew:false,
  };
}
function waiting(id:string,title:string,body?:string,cancel=false):TurnBasedCardPresentation {
  return {
    titleKey:`together.turnBased.${id}.title`,titleFallback:title,
    ...(body ? {bodyKey:`together.turnBased.${id}.body`,bodyFallback:body} : {}),
    refresh:true,cancel,dismiss:false,startNew:false,
  };
}
function terminal(id:string,title:string,startNew:boolean):TurnBasedCardPresentation {
  return {
    titleKey:`together.turnBased.${id}.title`,titleFallback:title,
    refresh:false,cancel:false,dismiss:true,startNew,
  };
}

export function remainingTime(expiresAt:string|null,now=Date.now()):string|null {
  if (!expiresAt) return null;
  const remaining=Math.max(0,new Date(expiresAt).getTime()-now);
  const hours=Math.floor(remaining/3_600_000);
  const minutes=Math.ceil((remaining%3_600_000)/60_000);
  return hours>0?`${hours}h ${minutes}m`:`${minutes}m`;
}
