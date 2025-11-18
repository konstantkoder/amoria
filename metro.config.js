const { getDefaultConfig } = require('@expo/metro-config');
const config = getDefaultConfig(__dirname);

// Firebase публикует .cjs – добавляем поддержку
config.resolver.sourceExts.push('cjs');

// Expo SDK 53+ включает строгие exports, Firebase конфликтует — отключаем
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
