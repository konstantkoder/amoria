type PromptSource = {
  promptKey?: string | null;
  promptText?: string | null;
};

type TranslateFn = (key: string, params?: Record<string, string>) => string;

const DRAW_PROMPT_TEXT_TO_KEY: Record<string, string> = {
  "Draw a tiny place you would both want to visit.": "draw.tinyPlace",
  "Draw two characters meeting for the first time.": "draw.firstMeeting",
  "Draw a shared dream room.": "draw.dreamRoom",
};

export function getTogetherPromptKey(source: PromptSource | null | undefined): string | null {
  const promptKey = source?.promptKey?.trim();
  if (promptKey) {
    return promptKey;
  }

  const promptText = source?.promptText?.trim();
  if (!promptText) {
    return null;
  }

  return DRAW_PROMPT_TEXT_TO_KEY[promptText] ?? null;
}

export function localizeTogetherPrompt(
  source: PromptSource | null | undefined,
  tt: TranslateFn
): string {
  const promptText = source?.promptText?.trim() ?? "";
  const promptKey = getTogetherPromptKey(source);
  if (!promptKey) {
    return promptText;
  }

  const key = `play.prompt.${promptKey}`;
  const localized = tt(key);
  return localized === key ? promptText : localized;
}
