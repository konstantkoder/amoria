const appJson = require("./app.json");

const qaBuildProfile =
  process.env.EAS_BUILD_PROFILE ??
  process.env.EXPO_PUBLIC_QA_BUILD_PROFILE ??
  null;

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
      qaBuildProfile,
    },
  },
};
