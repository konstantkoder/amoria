import sharp from "sharp";
import { AppError } from "../common/errors";
import { MAX_AVATAR_DIMENSION } from "../config/constants";

export type ProcessedImage = {
  buffer: Buffer;
  width: number | null;
  height: number | null;
  mimeType: "image/webp";
};

export async function processAvatarImage(input: Buffer): Promise<ProcessedImage> {
  try {
    const result = await sharp(input, { failOn: "warning" })
      .rotate()
      .resize({
        width: MAX_AVATAR_DIMENSION,
        height: MAX_AVATAR_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 82,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: result.data,
      width: result.info.width ?? null,
      height: result.info.height ?? null,
      mimeType: "image/webp",
    };
  } catch {
    throw new AppError("image_decode_failed", "Could not decode image", 400, {
      file: "decode_failed",
    });
  }
}
