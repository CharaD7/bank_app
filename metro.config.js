const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Fix for pnpm: resolve node_modules correctly
config.watchFolders = [path.resolve(__dirname, "node_modules")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

// Ensure .pnpm folder is not watched (improves performance)
config.resolver.blockList = [
  /node_modules\/\.pnpm\/.*/,
];

module.exports = withNativeWind(config, { 
  input: "./app/global.css",
  configPath: './tailwind.config.js',
});
