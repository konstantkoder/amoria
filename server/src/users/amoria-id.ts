import { randomInt } from "node:crypto";
import {
  AMORIA_ID_ALPHABET,
  AMORIA_ID_LENGTH,
  AMORIA_ID_PREFIX,
} from "../config/constants";

export function generateAmoriaId(): string {
  let suffix = "";
  for (let index = 0; index < AMORIA_ID_LENGTH; index += 1) {
    suffix += AMORIA_ID_ALPHABET[randomInt(0, AMORIA_ID_ALPHABET.length)];
  }

  return `${AMORIA_ID_PREFIX}-${suffix}`;
}
