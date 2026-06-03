import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { checkObjectStorageHealth } = require(
  "../src/media/object-storage",
) as typeof import("../src/media/object-storage");

const checkedAt = "2026-06-03T12:00:00.000Z";
const baseConfig = {
  provider: "s3",
  endpoint: "https://storage.internal.example",
  region: "us-east-1",
  accessKey: "secret-access-key",
  secretKey: "secret-secret-key",
  bucket: "sensitive-private-bucket",
};

type SentCommand = {
  input?: {
    Bucket?: string;
  };
  constructor: {
    name: string;
  };
};

test("object storage health returns not_configured when required config is missing", async () => {
  let called = false;

  const result = await checkObjectStorageHealth({
    config: {
      ...baseConfig,
      bucket: "",
    },
    now: () => new Date(checkedAt),
    send: async () => {
      called = true;
      return {};
    },
  });

  assert.deepEqual(result, {
    status: "not_configured",
    checkedAt,
    reason: "missing_config",
  });
  assert.equal(called, false);
});

test("object storage health uses non-mutating HeadBucket and returns ok when reachable", async () => {
  const commandNames: string[] = [];
  let checkedBucket: string | undefined;

  const result = await checkObjectStorageHealth({
    config: baseConfig,
    now: () => new Date(checkedAt),
    send: async (command) => {
      const sentCommand = command as SentCommand;
      commandNames.push(sentCommand.constructor.name);
      checkedBucket = sentCommand.input?.Bucket;
      return {};
    },
  });

  assert.deepEqual(result, {
    status: "ok",
    checkedAt,
  });
  assert.deepEqual(commandNames, ["HeadBucketCommand"]);
  assert.equal(checkedBucket, baseConfig.bucket);
  assert.equal(commandNames.includes("PutObjectCommand"), false);
  assert.equal(commandNames.includes("DeleteObjectCommand"), false);
});

test("object storage health returns error with a safe errorCode on failure", async () => {
  const result = await checkObjectStorageHealth({
    config: baseConfig,
    now: () => new Date(checkedAt),
    send: async () => {
      throw {
        name: "NoSuchBucket",
        message: "raw failure mentioning sensitive-private-bucket",
        $metadata: {
          httpStatusCode: 404,
        },
      };
    },
  });

  assert.deepEqual(result, {
    status: "error",
    checkedAt,
    errorCode: "bucket_not_found",
  });
});

test("object storage health returns not_checked when safe check is unavailable", async () => {
  const result = await checkObjectStorageHealth({
    config: baseConfig,
    now: () => new Date(checkedAt),
    send: async () => {
      throw {
        name: "NotImplemented",
        $metadata: {
          httpStatusCode: 501,
        },
      };
    },
  });

  assert.deepEqual(result, {
    status: "not_checked",
    checkedAt,
    reason: "safe_check_unavailable",
  });
});

test("object storage health response does not expose secrets, bucket, keys, or signed URLs", async () => {
  const result = await checkObjectStorageHealth({
    config: baseConfig,
    now: () => new Date(checkedAt),
    send: async () => {
      throw {
        name: "CredentialsProviderError",
        code: "CredentialsProviderError",
        message:
          "https://storage.internal.example/sensitive-private-bucket/users/private/object.webp?X-Amz-Signature=secret",
      };
    },
  });

  const serialized = JSON.stringify(result);
  assert.deepEqual(result, {
    status: "error",
    checkedAt,
    errorCode: "credentials_error",
  });
  assert.equal(serialized.includes(baseConfig.endpoint), false);
  assert.equal(serialized.includes(baseConfig.bucket), false);
  assert.equal(serialized.includes(baseConfig.accessKey), false);
  assert.equal(serialized.includes(baseConfig.secretKey), false);
  assert.equal(serialized.includes("users/private/object.webp"), false);
  assert.equal(serialized.includes("X-Amz-Signature"), false);
  assert.equal(serialized.includes("secret"), false);
});
