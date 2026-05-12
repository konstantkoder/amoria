import sharp from "sharp";
import { AppError } from "../common/errors";
import {
  MAX_AVATAR_DIMENSION,
  MAX_MEDIA_UPLOAD_BYTES,
  PROFILE_PHOTO_MAX_HEIGHT,
  PROFILE_PHOTO_MAX_WIDTH,
  PROFILE_PHOTO_MIN_HEIGHT,
  PROFILE_PHOTO_MIN_WIDTH,
} from "../config/constants";

export type ProcessedImage = {
  buffer: Buffer;
  width: number | null;
  height: number | null;
  mimeType: "image/webp";
};

export type ProcessedProfilePhotoImage = {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
  sourceMimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type ProfilePhotoImageConstraints = {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  maxSizeBytes: number;
};

const defaultProfilePhotoConstraints: ProfilePhotoImageConstraints = {
  minWidth: PROFILE_PHOTO_MIN_WIDTH,
  minHeight: PROFILE_PHOTO_MIN_HEIGHT,
  maxWidth: PROFILE_PHOTO_MAX_WIDTH,
  maxHeight: PROFILE_PHOTO_MAX_HEIGHT,
  maxSizeBytes: MAX_MEDIA_UPLOAD_BYTES,
};

const profilePhotoFormatMimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

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

export async function processProfilePhotoImage(
  input: Buffer,
  constraints: Partial<ProfilePhotoImageConstraints> = {},
): Promise<ProcessedProfilePhotoImage> {
  const limits = {
    ...defaultProfilePhotoConstraints,
    ...constraints,
  };

  if (input.length > limits.maxSizeBytes) {
    throw imageTooLarge("Profile photo file is too large", "too_large");
  }

  const metadata = await readProfilePhotoMetadata(input);
  const sourceMimeType = profilePhotoMimeType(metadata.format);
  if (!sourceMimeType) {
    throw new AppError(
      "unsupported_image_type",
      "Only JPEG, PNG, or WebP profile photos are supported",
      415,
      { file: "unsupported_image_type" },
    );
  }

  if (metadata.pages && metadata.pages > 1) {
    throw new AppError(
      "unsupported_image_type",
      "Animated images are not supported for profile photos",
      415,
      { file: "animated_image" },
    );
  }

  validateProfilePhotoDimensions(metadata.width, metadata.height, limits);

  try {
    const result = await sharp(input, {
      failOn: "warning",
      animated: false,
      limitInputPixels: PROFILE_PHOTO_MAX_WIDTH * PROFILE_PHOTO_MAX_HEIGHT,
    })
      .rotate()
      .webp({
        quality: 86,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    const dimensions = validateProfilePhotoDimensions(
      result.info.width,
      result.info.height,
      limits,
    );
    if (result.data.length > limits.maxSizeBytes) {
      throw imageTooLarge("Processed profile photo file is too large", "processed_too_large");
    }

    return {
      buffer: result.data,
      width: dimensions.width,
      height: dimensions.height,
      mimeType: "image/webp",
      sourceMimeType,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw corruptImage();
  }
}

async function readProfilePhotoMetadata(input: Buffer): Promise<sharp.Metadata> {
  try {
    return await sharp(input, { failOn: "warning", animated: false }).metadata();
  } catch {
    throw corruptImage();
  }
}

function profilePhotoMimeType(
  format: string | undefined,
): ProcessedProfilePhotoImage["sourceMimeType"] | undefined {
  if (format === "jpeg" || format === "png" || format === "webp") {
    return profilePhotoFormatMimeTypes[format];
  }

  return undefined;
}

function validateProfilePhotoDimensions(
  width: number | undefined,
  height: number | undefined,
  limits: ProfilePhotoImageConstraints,
): { width: number; height: number } {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    throw new AppError("invalid_image", "Profile photo dimensions could not be read", 422, {
      dimensions: "missing",
    });
  }

  if (width < limits.minWidth || height < limits.minHeight) {
    throw new AppError("image_too_small", "Profile photo dimensions are too small", 422, {
      dimensions: "too_small",
    });
  }

  if (width > limits.maxWidth || height > limits.maxHeight) {
    throw imageDimensionsTooLarge();
  }

  return { width, height };
}

function imageDimensionsTooLarge(): AppError {
  return new AppError("image_too_large", "Profile photo dimensions are too large", 422, {
    dimensions: "too_large",
  });
}

function imageTooLarge(message: string, detail: string): AppError {
  return new AppError("image_too_large", message, 413, {
    file: detail,
  });
}

function corruptImage(): AppError {
  return new AppError("corrupt_image", "Could not decode profile photo image", 400, {
    file: "corrupt_image",
  });
}
