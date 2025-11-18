// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          // alias @ -> src (оставляем, если уже был подключён)
          root: ['./'],
          alias: { '@': './src' },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
      // ДОЛЖЕН быть последним
      'react-native-reanimated/plugin',
    ],
  };
};
