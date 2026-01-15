import type { TranslateFn } from "@/utils/i18n";

const NICKNAME_PREFIX = "nick.";

export function formatNickname(value: string, t: TranslateFn) {
  if (!value || !value.startsWith(NICKNAME_PREFIX)) return value;
  const parts = value.split(".");
  if (parts.length !== 4) return value;
  const color = parts[1];
  const animal = parts[2];
  const number = parts[3];
  const colorText = t(`nickname.color.${color}`);
  const animalText = t(`nickname.animal.${animal}`);
  return t("nickname.format", { color: colorText, animal: animalText, number });
}
