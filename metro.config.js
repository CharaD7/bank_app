const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require('path');
const fs = require('fs');

// Patch path.relative to handle undefined values from Metro bundler
// This is specifically to fix Node.js v23+ compatibility issues
const originalRelative = path.relative;
path.relative = function(from, to) {
  if (typeof to === 'undefined' || to === null) {
    // Only warn in development and provide a more specific fallback
    if (__DEV__) {
      console.warn('Metro: Encountered undefined module path, this may indicate a bundler issue');
    }
    return 'metro-undefined-module';
  }
  if (typeof from === 'undefined' || from === null) {
    if (__DEV__) {
      console.warn('Metro: Encountered undefined from path, using project directory');
    }
    from = __dirname;
  }
  return originalRelative.call(this, from, to);
};

// Get base configuration
const config = getDefaultConfig(__dirname);

// Performance optimizations
const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';

// Simple caching configuration (using default cache mechanism)
// Note: FileStore cache removed due to compatibility issues with this Metro version
config.cacheVersion = '1.0'; // Invalidate cache when needed

// Optimize resolver for faster dependency resolution
config.resolver = {
  ...config.resolver,
  // Cache resolved modules aggressively
  hasteImplModulePath: undefined,
  // Enable symlink resolution for monorepos and faster builds
  unstable_enableSymlinks: true,
  // Optimize extensions order (most common first)
  sourceExts: [...config.resolver.sourceExts, 'jsx', 'js', 'ts', 'tsx'],
  // Asset extensions optimization
  assetExts: [...config.resolver.assetExts.filter(ext => !['svg'].includes(ext))],
  // Block list for faster resolution
  blockList: [
    // Block unnecessary directories from resolution
    /.*\/__tests__\/.*/,
    /.*\/android\/build\/.*/,
    /.*\/ios\/build\/.*/,
    /.*\/.git\/.*/,
    /.*\/node_modules\/.*\/test\/.*/,
    /.*\/node_modules\/.*\/__tests__\/.*/,
  ],
  // No aliases needed now that infinity.js is fixed
  alias: {},
};

// Transformer optimizations
config.transformer = {
  ...config.transformer,
  // Optimize bundle splitting
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true, // Inline requires for smaller bundles
    },
  }),
  // Enable Hermes transforms for better performance
  hermesParser: true,
  // Minify in production, skip in development for speed
  minifierConfig: isProd ? {
    keep_fnames: true,
    mangle: {
      keep_fnames: true,
    },
  } : undefined,
};

// Serializer optimizations (keeping it simple to avoid compatibility issues)
config.serializer = {
  ...config.serializer,
  // Optimize module ordering
  createModuleIdFactory: () => (path) => {
    // Create shorter, more predictable module IDs
    const name = path.replace(__dirname, '');
    return name.replace(/[^a-zA-Z0-9]/g, '_');
  },
  // Removed experimental options that cause issues
};

// Server optimizations
config.server = {
  ...config.server,
  // Increase port range for faster startup
  port: 8081,
  // Disable error overlay in development for faster reloads
  ...(isDev && {
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Disable error overlay by intercepting error requests
        if (req.url && req.url.includes('__metro_error_overlay')) {
          res.writeHead(404);
          res.end();
          return;
        }
        return middleware(req, res, next);
      };
    },
  }),
};

// Watcher optimizations
config.watcher = {
  ...config.watcher,
  // Optimize file watching
  additionalExts: ['jsx', 'tsx'],
  // Note: `ignored` option has been moved to resolver.blockList in newer Metro versions
  // File watching ignores are now handled by resolver.blockList above
};

// Enable unstable features for better performance
config.unstable_perfLoggerFactory = undefined; // Disable perf logging for speed

// Custom asset plugin for optimized asset handling
if (!config.transformer.assetPlugins) {
  config.transformer.assetPlugins = [];
}

// Development-specific optimizations
if (isDev) {
  // Disable source maps in development for faster builds
  config.transformer.enableBabelRCLookup = false;
  config.transformer.enableBabelRuntime = false;
  
  // Fast refresh optimizations
  config.resolver.platforms = ['ios', 'android', 'web'];
}

// Production-specific optimizations
if (isProd) {
  // Enable all production optimizations
  config.transformer.minifierPath = 'metro-minify-terser';
  config.transformer.minifierConfig = {
    ecma: 8,
    keep_fnames: true,
    mangle: {
      keep_fnames: true,
    },
    compress: {
      drop_console: true, // Remove console logs in production
    },
  };
}

// Ensure cache directory exists
const cacheDir = path.join(__dirname, '.metro-cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Export with NativeWind integration
module.exports = withNativeWind(config, { 
  input: "./app/global.css",
  // NativeWind optimizations
  configPath: './tailwind.config.js',
});
