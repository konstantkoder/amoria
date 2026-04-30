import type { MultipartFile } from "@fastify/multipart";
import { AppError, unauthorized, validationError } from "../common/errors";
import { MAX_AVATAR_INPUT_BYTES } from "../config/constants";
import { updateUserAvatar } from "../users/users.repo";
import { toSelfUserProfile, type SelfUserProfile } from "../users/users.service";
import { assertAvatarInput, checksumSha256, isMultipartFileTooLarge } from "./file-guards";
import { processAvatarImage } from "./image-processing";
import { saveAvatar } from "./local-storage";
import { createMediaFile } from "./media.repo";

export type AvatarUploadResponse = {
  avatarUrl: string;
  user: SelfUserProfile;
};

export async function uploadAvatar(
  userId: string,
  file: MultipartFile | undefined,
): Promise<AvatarUploadResponse> {
  if (!file) {
    throw validationError("Avatar file is required", { file: "required" });
  }

  let inputBuffer: Buffer;
  try {
    inputBuffer = await file.toBuffer();
  } catch (error) {
    if (isMultipartFileTooLarge(error)) {
      throw new AppError("file_too_large", "Avatar file must be 8 MB or smaller", 413, {
        file: "too_large",
      });
    }
    throw error;
  }

  if ((file.file as { truncated?: boolean }).truncated || inputBuffer.length > MAX_AVATAR_INPUT_BYTES) {
    throw new AppError("file_too_large", "Avatar file must be 8 MB or smaller", 413, {
      file: "too_large",
    });
  }

  assertAvatarInput(inputBuffer);
  const processed = await processAvatarImage(inputBuffer);
  const checksum = checksumSha256(processed.buffer);
  const stored = await saveAvatar(userId, processed.buffer);

  await createMediaFile({
    ownerUserId: userId,
    type: "avatar",
    path: stored.relativePath,
    url: stored.url,
    mimeType: processed.mimeType,
    sizeBytes: processed.buffer.length,
    width: processed.width,
    height: processed.height,
    checksumSha256: checksum,
  });

  const user = await updateUserAvatar(userId, stored.url);
  if (!user) {
    throw unauthorized("User no longer exists");
  }

  return {
    avatarUrl: stored.url,
    user: toSelfUserProfile(user),
  };
}
