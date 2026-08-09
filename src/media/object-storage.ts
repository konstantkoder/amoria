import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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

export type GetObjectBufferInput = ObjectStorageInput & {
  maxBytes: number;
};

export type PutObjectBufferInput = ObjectStorageInput & {
  body: Buffer;
  contentType: string;
};

export type ObjectStorageHealthStatus =
  | "ok"
  | "not_configured"
  | "error"
  | "not_checked";

export type ObjectStorageHealthReason =
  | "missing_config"
  | "safe_check_unavailable";

export type ObjectStorageHealth = {
  status: ObjectStorageHealthStatus;
  checkedAt: string;
  reason?: ObjectStorageHealthReason;
  errorCode?: string;
};

type ObjectStorageHealthConfig = {
  provider: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
};

type ObjectStorageHealthDeps = {
  config?: Partial<ObjectStorageHealthConfig>;
  now?: () => Date;
  send?: (command: HeadBucketCommand) => Promise<unknown>;
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

export async function checkObjectStorageHealth(
  deps: ObjectStorageHealthDeps = {},
): Promise<ObjectStorageHealth> {
  const checkedAt = (deps.now?.() ?? new Date()).toISOString();
  const config = objectStorageHealthConfig(deps.config);

  if (!isObjectStorageConfigured(config)) {
    return {
      status: "not_configured",
      checkedAt,
      reason: "missing_config",
    };
  }

  if (config.provider !== "s3") {
    return {
      status: "not_checked",
      checkedAt,
      reason: "safe_check_unavailable",
    };
  }

  try {
    await (deps.send ?? ((command) => s3Client.send(command)))(
      new HeadBucketCommand({
        Bucket: config.bucket,
      }),
    );

    return {
      status: "ok",
      checkedAt,
    };
  } catch (error) {
    if (isSafeBucketCheckUnavailable(error)) {
      return {
        status: "not_checked",
        checkedAt,
        reason: "safe_check_unavailable",
      };
    }

    return {
      status: "error",
      checkedAt,
      errorCode: safeObjectStorageErrorCode(error),
    };
  }
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

export async function getObjectBuffer(input: GetObjectBufferInput): Promise<Buffer> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
      }),
    );

    if (!result.Body) {
      throw new AppError("internal_error", "Object storage did not return object body", 500);
    }

    return await readBodyWithLimit(result.Body, input.maxBytes);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isObjectNotFound(error)) {
      throw new AppError("not_found", "Object was not found in storage", 404);
    }

    throw new AppError("internal_error", "Object storage get request failed", 500);
  }
}

export async function putObjectBuffer(input: PutObjectBufferInput): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentLength: input.body.length,
        ContentType: input.contentType,
      }),
    );
  } catch {
    throw new AppError("internal_error", "Object storage put request failed", 500);
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

export async function listObjectKeys(input: {
  bucket: string;
  maximumKeys?: number;
}): Promise<{ keys: string[]; truncated: boolean }> {
  const maximumKeys = input.maximumKeys ?? 10_000;
  if (!Number.isInteger(maximumKeys) || maximumKeys < 1 || maximumKeys > 10_000) {
    throw new AppError("internal_error", "Object listing limit is invalid", 500);
  }
  const keys: string[] = [];
  let continuationToken: string | undefined;
  let truncated = false;
  do {
    const result = await s3Client.send(new ListObjectsV2Command({
      Bucket: input.bucket,
      ContinuationToken: continuationToken,
      MaxKeys: Math.min(1000, maximumKeys - keys.length),
    }));
    for (const object of result.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = result.NextContinuationToken;
    truncated = Boolean(result.IsTruncated);
  } while (truncated && continuationToken && keys.length < maximumKeys);
  return { keys, truncated: truncated && keys.length >= maximumKeys };
}

function objectStorageHealthConfig(
  overrides: Partial<ObjectStorageHealthConfig> | undefined,
): ObjectStorageHealthConfig {
  return {
    provider: overrides?.provider ?? env.OBJECT_STORAGE_PROVIDER,
    endpoint: overrides?.endpoint ?? env.S3_ENDPOINT,
    region: overrides?.region ?? env.S3_REGION,
    accessKey: overrides?.accessKey ?? env.S3_ACCESS_KEY,
    secretKey: overrides?.secretKey ?? env.S3_SECRET_KEY,
    bucket: overrides?.bucket ?? env.S3_BUCKET,
  };
}

function isObjectStorageConfigured(config: ObjectStorageHealthConfig): boolean {
  return Boolean(
    config.provider.trim() &&
      config.endpoint.trim() &&
      config.region.trim() &&
      config.accessKey.trim() &&
      config.secretKey.trim() &&
      config.bucket.trim(),
  );
}

function isObjectNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey"
  );
}

function isSafeBucketCheckUnavailable(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  const name = candidate.name?.toLowerCase() ?? "";
  return (
    candidate.$metadata?.httpStatusCode === 405 ||
    name === "notimplemented" ||
    name === "not_supported" ||
    name === "unsupportedoperation"
  );
}

function safeObjectStorageErrorCode(error: unknown): string {
  const candidate = error as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const name = (candidate.name ?? candidate.code ?? "").toLowerCase();
  const statusCode = candidate.$metadata?.httpStatusCode;

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    name.includes("accessdenied") ||
    name.includes("forbidden")
  ) {
    return "access_denied";
  }

  if (
    statusCode === 404 ||
    name.includes("nosuchbucket") ||
    name.includes("notfound")
  ) {
    return "bucket_not_found";
  }

  if (
    name.includes("credential") ||
    name.includes("signature") ||
    name.includes("invalidaccesskeyid")
  ) {
    return "credentials_error";
  }

  if (
    statusCode === 408 ||
    name.includes("timeout") ||
    name.includes("econnrefused") ||
    name.includes("network")
  ) {
    return "request_failed";
  }

  return "storage_check_failed";
}

async function readBodyWithLimit(body: unknown, maxBytes: number): Promise<Buffer> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new AppError("internal_error", "Object storage read limit is invalid", 500);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  const append = (chunk: Uint8Array | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new AppError("file_too_large", "Object exceeds maximum allowed size", 413, {
        file: "too_large",
      });
    }
    chunks.push(buffer);
  };

  if (body instanceof Uint8Array || typeof body === "string") {
    append(body);
    return Buffer.concat(chunks, totalBytes);
  }

  if (isAsyncIterableBody(body)) {
    for await (const chunk of body) {
      append(chunk);
    }
    return Buffer.concat(chunks, totalBytes);
  }

  if (isReadableStreamBody(body)) {
    const reader = body.getReader();
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        append(result.value);
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, totalBytes);
  }

  throw new AppError("internal_error", "Object storage body is not readable", 500);
}

function isAsyncIterableBody(body: unknown): body is AsyncIterable<Uint8Array> {
  return Boolean(body && typeof (body as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function");
}

function isReadableStreamBody(body: unknown): body is {
  getReader: () => {
    read: () => Promise<{ done: boolean; value: Uint8Array }>;
    releaseLock?: () => void;
  };
} {
  return Boolean(body && typeof (body as { getReader?: unknown }).getReader === "function");
}
