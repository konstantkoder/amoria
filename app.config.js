const baseConfig = require("./app.json").expo;

const VARIANTS = {
  development: {
    name: "Amoria Dev",
    identifier: "com.kostiantyndemidets.amoria.dev",
    scheme: "amoria-dev",
  },
  preview: {
    name: "Amoria Preview",
    identifier: "com.kostiantyndemidets.amoria.preview",
    scheme: "amoria-preview",
  },
  production: {
    name: "Amoria",
    identifier: "com.kostiantyndemidets.amoria",
    scheme: "amoria",
  },
};

function resolveAppVariant() {
  const appVariant = String(process.env.APP_VARIANT || "").trim();
  const buildProfile = String(process.env.EAS_BUILD_PROFILE || "").trim();

  if (appVariant && buildProfile && VARIANTS[buildProfile] && appVariant !== buildProfile) {
    throw new Error(`APP_VARIANT=${appVariant} does not match EAS_BUILD_PROFILE=${buildProfile}`);
  }

  const requested = appVariant || (VARIANTS[buildProfile] ? buildProfile : "development");
  if (!VARIANTS[requested]) {
    throw new Error("APP_VARIANT must be development, preview, or production");
  }
  return requested;
}

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

function configurePlugins(plugins, variant) {
  return (plugins || []).map((plugin) => {
    if (plugin === "expo-dev-client") {
      return ["expo-dev-client", { addGeneratedScheme: variant === "development" }];
    }
    if (Array.isArray(plugin) && plugin[0] === "expo-build-properties") {
      const options = plugin[1] || {};
      return [
        plugin[0],
        {
          ...options,
          android: {
            ...(options.android || {}),
            usesCleartextTraffic: variant !== "production",
          },
        },
      ];
    }
    return plugin;
  });
}

module.exports = ({ config = {} } = {}) => {
  const variant = resolveAppVariant();
  const selected = VARIANTS[variant];
  const production = variant === "production";
  const appLinkHost = String(process.env.EXPO_PUBLIC_APP_LINK_HOST || "").trim().toLowerCase();
  if (appLinkHost && (appLinkHost.includes("://") || isPrivateOrLocalHostname(appLinkHost))) {
    throw new Error("EXPO_PUBLIC_APP_LINK_HOST must be a public hostname without a protocol");
  }

  if (production) {
    requireProductionUrl("EXPO_PUBLIC_API_URL", "https");
    requireProductionUrl("EXPO_PUBLIC_WS_URL", "wss");
  }

  return {
    ...baseConfig,
    ...config,
    name: selected.name,
    scheme: selected.scheme,
    plugins: configurePlugins(config.plugins || baseConfig.plugins, variant),
    ios: {
      ...baseConfig.ios,
      ...(config.ios || {}),
      bundleIdentifier: selected.identifier,
    },
    android: {
      ...baseConfig.android,
      ...(config.android || {}),
      package: selected.identifier,
      ...(production ? { usesCleartextTraffic: false } : {}),
      ...(appLinkHost ? {
        intentFilters: [{
          action: "VIEW",
          autoVerify: production,
          category: ["BROWSABLE", "DEFAULT"],
          data: [{ scheme: "https", host: appLinkHost, pathPrefix: "/i/" }],
        }],
      } : {}),
    },
  };
};

module.exports.isPrivateOrLocalHostname = isPrivateOrLocalHostname;
module.exports.requireProductionUrl = requireProductionUrl;
module.exports.resolveAppVariant = resolveAppVariant;
