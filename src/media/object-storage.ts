import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "../common/errors";
import { env } from "../config/env";

const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export type CreatePutPresignedUrlInput = {
  bucket: string;
  key: string;
  contentType: string;
  expiresInSec: number;
};

export type ObjectStorageInput = {
  bucket: string;
  key: string;
};

export type HeadObjectResult = {
  sizeBytes: number;
  contentType: string;
};

export async function createPutPresignedUrl(
  input: CreatePutPresignedUrlInput,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
    ContentType: input.contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: input.expiresInSec });
}

export async function headObject(input: ObjectStorageInput): Promise<HeadObjectResult> {
  try {
    const result = await s3Client.send(
      new HeadObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
      }),
    );

    if (typeof result.ContentLength !== "number") {
      throw new AppError("internal_error", "Object storage did not return object size", 500);
    }

    return {
      sizeBytes: result.ContentLength,
      contentType: result.ContentType ?? "",
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isObjectNotFound(error)) {
      throw new AppError("not_found", "Object was not found in storage", 404);
    }

    throw new AppError("internal_error", "Object storage head request failed", 500);
  }
}

export async function deleteObject(input: ObjectStorageInput): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
      }),
    );
  } catch {
    throw new AppError("internal_error", "Object storage delete request failed", 500);
  }
}

function isObjectNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey"
  );
}
