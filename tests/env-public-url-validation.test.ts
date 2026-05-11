import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { validateProductionPublicUrl, validatePublicUrlEnv } = require(
  "../src/config/env",
) as typeof import("../src/config/env");

test("production public URL validation accepts HTTPS domains", () => {
  assert.doesNotThrow(() => {
    validateProductionPublicUrl("PUBLIC_API_URL", "https://api.example.com");
  });
});

test("production public URL validation accepts Cloudflare tunnel URLs", () => {
  assert.doesNotThrow(() => {
    validateProductionPublicUrl("PUBLIC_API_URL", "https://abc.trycloudflare.com");
  });
});

test("production public URL validation rejects localhost", () => {
  assert.throws(
    () => validateProductionPublicUrl("PUBLIC_API_URL", "https://localhost:4000"),
    /localhost, private IPs, or minio/,
  );
});

test("production public URL validation rejects private IPs", () => {
  assert.throws(
    () => validateProductionPublicUrl("PUBLIC_MEDIA_URL", "https://192.168.1.20/media"),
    /localhost, private IPs, or minio/,
  );
  assert.throws(
    () => validateProductionPublicUrl("PUBLIC_MEDIA_URL", "https://10.0.0.5/media"),
    /localhost, private IPs, or minio/,
  );
  assert.throws(
    () => validateProductionPublicUrl("PUBLIC_MEDIA_URL", "https://172.16.0.5/media"),
    /localhost, private IPs, or minio/,
  );
});

test("production public URL validation rejects minio as a public URL", () => {
  assert.throws(
    () => validateProductionPublicUrl("S3_PUBLIC_BASE_URL", "https://minio:9000/amoria"),
    /localhost, private IPs, or minio/,
  );
});

test("production public URL validation rejects HTTP", () => {
  assert.throws(
    () => validateProductionPublicUrl("PUBLIC_API_URL", "http://api.example.com"),
    /must use https/,
  );
});

test("internal S3_ENDPOINT minio remains allowed when public URLs are release-safe", () => {
  assert.doesNotThrow(() => {
    validatePublicUrlEnv({
      nodeEnv: "production",
      allowLocalPublicUrls: false,
      publicApiUrl: "https://api.example.com",
      publicMediaUrl: "https://media.example.com",
      s3PublicBaseUrl: "https://cdn.example.com/amoria",
      s3Endpoint: "http://minio:9000",
    });
  });
});

test("ALLOW_LOCAL_PUBLIC_URLS cannot bypass production validation", () => {
  assert.throws(
    () =>
      validatePublicUrlEnv({
        nodeEnv: "production",
        allowLocalPublicUrls: true,
        publicApiUrl: "https://api.example.com",
        publicMediaUrl: "https://media.example.com",
        s3PublicBaseUrl: "https://cdn.example.com/amoria",
      }),
    /development or test/,
  );
});
