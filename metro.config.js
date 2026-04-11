if (!Array.prototype.toReversed) {
  Object.defineProperty(Array.prototype, "toReversed", {
    value: function toReversed() {
      return [...this].reverse();
    },
    configurable: true,
    writable: true,
  });
}

const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);

// Firebase публикует .cjs – добавляем поддержку
if (!config.resolver.sourceExts.includes("cjs")) {
  config.resolver.sourceExts.push("cjs");
}

// Expo SDK 53+ включает строгие exports, Firebase конфликтует — отключаем
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
