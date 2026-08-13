import sharp from "sharp";
import { AppError } from "../common/errors";
import {
  AVATAR_IMAGE_SIZE,
  MAX_AVATAR_INPUT_BYTES,
  MAX_MEDIA_UPLOAD_BYTES,
  PROFILE_PHOTO_MAX_HEIGHT,
  PROFILE_PHOTO_MAX_WIDTH,
  PROFILE_PHOTO_MIN_HEIGHT,
  PROFILE_PHOTO_MIN_WIDTH,
  PROFILE_PHOTO_OUTPUT_MAX_SIZE,
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

export type NormalizedMediaCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
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

export function normalizeMediaCrop(input: unknown): NormalizedMediaCrop | undefined {
  if (input == null || input === "") {
    return undefined;
  }

  const value = typeof input === "string" ? parseCropJson(input) : input;
  if (!value || typeof value !== "object") {
    throw invalidCrop("invalid");
  }

  const crop = value as Partial<Record<keyof NormalizedMediaCrop, unknown>>;
  const normalized = {
    x: readCropNumber(crop.x, "x"),
    y: readCropNumber(crop.y, "y"),
    width: readCropNumber(crop.width, "width"),
    height: readCropNumber(crop.height, "height"),
  };

  if (normalized.x < 0 || normalized.y < 0) {
    throw invalidCrop("origin_out_of_bounds");
  }
  if (normalized.width <= 0 || normalized.height <= 0) {
    throw invalidCrop("size_required");
  }
  if (normalized.x + normalized.width > 1 + 0.000001 ||
      normalized.y + normalized.height > 1 + 0.000001) {
    throw invalidCrop("out_of_bounds");
  }

  return normalized;
}

export async function processAvatarImage(
  input: Buffer,
  crop?: NormalizedMediaCrop,
): Promise<ProcessedImage> {
  if (input.length > MAX_AVATAR_INPUT_BYTES) {
    throw imageTooLarge("Avatar file is too large", "too_large");
  }

  const metadata = await readProfilePhotoMetadata(input);
  const sourceMimeType = profilePhotoMimeType(metadata.format);
  if (!sourceMimeType) {
    throw new AppError(
      "unsupported_image_type",
      "Only JPEG, PNG, or WebP avatar images are supported",
      415,
      { file: "unsupported_image_type" },
    );
  }

  if (metadata.pages && metadata.pages > 1) {
    throw new AppError(
      "unsupported_image_type",
      "Animated images are not supported for avatars",
      415,
      { file: "animated_image" },
    );
  }

  validateImageDimensions(
    metadata.width,
    metadata.height,
    defaultProfilePhotoConstraints,
    "Avatar",
  );

  try {
    const oriented = await toOrientedImage(input);
    const orientedDimensions = validateImageDimensions(
      oriented.info.width,
      oriented.info.height,
      defaultProfilePhotoConstraints,
      "Avatar",
    );
    const squareCrop = resolveSquareCrop(crop, orientedDimensions, "Avatar");
    validateImageDimensions(squareCrop.width, squareCrop.height, defaultProfilePhotoConstraints, "Avatar");

    const result = await sharp(oriented.data, {
      failOn: "warning",
      animated: false,
      limitInputPixels: PROFILE_PHOTO_MAX_WIDTH * PROFILE_PHOTO_MAX_HEIGHT,
    })
      .extract(squareCrop)
      .resize({
        width: AVATAR_IMAGE_SIZE,
        height: AVATAR_IMAGE_SIZE,
        fit: "fill",
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
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw corruptImage();
  }
}

export async function processProfilePhotoImage(
  input: Buffer,
  constraints: Partial<ProfilePhotoImageConstraints> = {},
  crop?: NormalizedMediaCrop,
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

  validateImageDimensions(metadata.width, metadata.height, limits, "Profile photo");

  try {
    const oriented = await toOrientedImage(input);
    const orientedDimensions = validateImageDimensions(
      oriented.info.width,
      oriented.info.height,
      limits,
      "Profile photo",
    );
    const squareCrop = resolveSquareCrop(crop, orientedDimensions, "Profile photo");
    validateImageDimensions(
      squareCrop.width,
      squareCrop.height,
      limits,
      "Profile photo",
    );

    const result = await sharp(oriented.data, {
      failOn: "warning",
      animated: false,
      limitInputPixels: PROFILE_PHOTO_MAX_WIDTH * PROFILE_PHOTO_MAX_HEIGHT,
    })
      .extract(squareCrop)
      .resize({
        width: PROFILE_PHOTO_OUTPUT_MAX_SIZE,
        height: PROFILE_PHOTO_OUTPUT_MAX_SIZE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 86,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    const dimensions = validateImageDimensions(
      result.info.width,
      result.info.height,
      limits,
      "Profile photo",
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

async function toOrientedImage(
  input: Buffer,
): Promise<{ data: Buffer; info: sharp.OutputInfo }> {
  try {
    return await sharp(input, {
      failOn: "warning",
      animated: false,
      limitInputPixels: PROFILE_PHOTO_MAX_WIDTH * PROFILE_PHOTO_MAX_HEIGHT,
    })
      .rotate()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

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

function validateImageDimensions(
  width: number | undefined,
  height: number | undefined,
  limits: ProfilePhotoImageConstraints,
  label: "Avatar" | "Profile photo",
): { width: number; height: number } {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    throw new AppError("invalid_image", `${label} dimensions could not be read`, 422, {
      dimensions: "missing",
    });
  }

  if (width < limits.minWidth || height < limits.minHeight) {
    throw new AppError("image_too_small", `${label} dimensions are too small`, 422, {
      dimensions: "too_small",
    });
  }

  if (width > limits.maxWidth || height > limits.maxHeight) {
    throw imageDimensionsTooLarge(label);
  }

  return { width, height };
}

function parseCropJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw invalidCrop("invalid_json");
  }
}

function readCropNumber(value: unknown, field: keyof NormalizedMediaCrop): number {
  const numberValue = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numberValue)) {
    throw invalidCrop(`${field}_invalid`);
  }
  return numberValue;
}

function resolveSquareCrop(
  crop: NormalizedMediaCrop | undefined,
  dimensions: { width: number; height: number },
  label: "Avatar" | "Profile photo",
): sharp.Region {
  if (!crop) {
    const size = Math.min(dimensions.width, dimensions.height);
    return {
      left: Math.floor((dimensions.width - size) / 2),
      top: Math.floor((dimensions.height - size) / 2),
      width: size,
      height: size,
    };
  }

  const left = Math.round(crop.x * dimensions.width);
  const top = Math.round(crop.y * dimensions.height);
  const width = Math.round(crop.width * dimensions.width);
  const height = Math.round(crop.height * dimensions.height);

  if (width <= 0 || height <= 0) {
    throw invalidCrop("size_required");
  }
  if (Math.abs(width - height) > 1) {
    throw invalidCrop(label === "Avatar" ? "avatar_must_be_square" : "profile_photo_must_be_square");
  }

  const squareSize = Math.min(width, height);
  if (
    left < 0 ||
    top < 0 ||
    left + squareSize > dimensions.width ||
    top + squareSize > dimensions.height
  ) {
    throw invalidCrop("out_of_bounds");
  }

  return {
    left,
    top,
    width: squareSize,
    height: squareSize,
  };
}

function imageDimensionsTooLarge(label: string): AppError {
  return new AppError("image_too_large", `${label} dimensions are too large`, 422, {
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

function invalidCrop(reason: string): AppError {
  return new AppError("invalid_crop", "Crop metadata is invalid", 400, {
    crop: reason,
  });
}
