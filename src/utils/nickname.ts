import type { TranslateFn } from "@/utils/i18n";

const NICKNAME_PREFIX = "nick.";

export function formatNickname(value: string, t: TranslateFn) {
  if (!value || !value.startsWith(NICKNAME_PREFIX)) return value;
  const parts = value.split(".");
  if (parts.length !== 4) return value;
  const color = parts[1];
  const animal = parts[2];
  const number = parts[3];
  const colorKey = `nickname.color.${color}`;
  const animalKey = `nickname.animal.${animal}`;
  const colorText = t(colorKey);
  const animalText = t(animalKey);
  return t("nickname.format", {
    color: colorText === colorKey ? color : colorText,
    animal: animalText === animalKey ? animal : animalText,
    number,
  });
}
