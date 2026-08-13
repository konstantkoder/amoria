const baseConfig = require("./app.json").expo;

function isPrivateOrLocalHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  ) {
    return true;
  }

  const octets = normalized.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function requireProductionUrl(name, expectedProtocol) {
  const value = String(process.env[name] || "").trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be configured as a valid ${expectedProtocol} URL for production`);
  }
  if (url.protocol !== `${expectedProtocol}:`) {
    throw new Error(`${name} must use ${expectedProtocol} for production`);
  }
  if (url.username || url.password || isPrivateOrLocalHostname(url.hostname)) {
    throw new Error(`${name} must use a public host without embedded credentials for production`);
  }
  return url;
}

module.exports = ({ config = {} } = {}) => {
  const production = process.env.EAS_BUILD_PROFILE === "production";
  if (production) {
    requireProductionUrl("EXPO_PUBLIC_API_URL", "https");
    requireProductionUrl("EXPO_PUBLIC_WS_URL", "wss");
  }

  return {
    ...baseConfig,
    ...config,
    android: {
      ...baseConfig.android,
      ...(config.android || {}),
      usesCleartextTraffic: production ? false : baseConfig.android.usesCleartextTraffic,
    },
  };
};

module.exports.isPrivateOrLocalHostname = isPrivateOrLocalHostname;
module.exports.requireProductionUrl = requireProductionUrl;
