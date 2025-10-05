/**
 * Performance Configuration for 5x Faster Builds
 * Advanced build optimizations and parallel processing settings
 */

const os = require('os');
const path = require('path');
const { logger } = require('./lib/logger');

// Get optimal worker count based on CPU cores
const CPU_CORES = os.cpus().length;
const OPTIMAL_WORKERS = Math.min(CPU_CORES - 1, 8); // Leave 1 core free, max 8 workers
const IS_CI = process.env.CI === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';

logger.info('BUILD', `Performance Config: Using ${OPTIMAL_WORKERS} workers on ${CPU_CORES} cores`);

const performanceConfig = {
  // Parallel processing configuration
  parallel: {
    enabled: true,
    workers: OPTIMAL_WORKERS,
    // Use more workers in CI environments
    ciWorkers: IS_CI ? Math.min(CPU_CORES, 12) : OPTIMAL_WORKERS,
  },

  // Memory optimization
  memory: {
    // Allocate more memory for faster builds
    nodeOptions: [
      `--max-old-space-size=${IS_CI ? 8192 : 4096}`, // 8GB in CI, 4GB locally
      '--max-semi-space-size=256',
      '--optimize-for-size', // Optimize for memory usage
    ],
    // Garbage collection optimizations
    gcOptions: [
      '--expose-gc',
      '--gc-interval=100',
    ],
  },

  // Source map configuration
  sourceMaps: {
    development: {
      enabled: false, // Disable for faster dev builds
      format: 'cheap-module-source-map',
    },
    production: {
      enabled: true,
      format: 'source-map',
      // Only include source maps for debugging, not in final bundle
      exclude: ['node_modules'],
    },
  },

  // Cache configuration
  cache: {
    // Metro cache settings
    metro: {
      enabled: true,
      directory: path.join(__dirname, '.metro-cache'),
      // Cache for 7 days
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
    // TypeScript cache
    typescript: {
      enabled: true,
      incremental: true,
      directory: path.join(__dirname, '.tscache'),
    },
    // Babel cache
    babel: {
      enabled: true,
      directory: path.join(__dirname, 'node_modules/.cache/babel'),
    },
  },

  // Build optimization flags
  optimization: {
    // Skip type checking in development for speed
    skipTypeCheck: NODE_ENV === 'development',
    // Use SWC for faster transpilation (if available)
    useSwc: false, // Set to true if you have SWC installed
    // Enable tree shaking
    treeShaking: true,
    // Minification settings
    minification: {
      development: false,
      production: true,
      // Terser options for production
      terserOptions: {
        parallel: OPTIMAL_WORKERS,
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info'],
        },
        mangle: {
          keep_fnames: true,
        },
      },
    },
  },

  // File watching optimizations
  watching: {
    // Ignore patterns for faster file watching
    ignored: [
      /node_modules/,
      /.git/,
      /.expo/,
      /.metro-cache/,
      /android\/build/,
      /ios\/build/,
      /__tests__/,
      /coverage/,
      /.tsbuildinfo/,
    ],
    // Polling settings for better performance
    poll: false, // Use native file watching
    aggregateTimeout: 100, // Batch file changes
  },

  // Bundle splitting for web builds
  bundleSplitting: {
    enabled: process.env.EXPO_WEB === 'true',
    chunks: {
      vendor: ['react', 'react-dom', 'react-native-web'],
      common: {
        minChunks: 2,
        priority: -10,
        reuseExistingChunk: true,
      },
    },
  },

  // Asset optimization
  assets: {
    // Image optimization
    images: {
      enabled: true,
      quality: NODE_ENV === 'production' ? 85 : 95,
      progressive: true,
      // WebP conversion for supported platforms
      webp: {
        enabled: process.env.EXPO_WEB === 'true',
        quality: 80,
      },
    },
    // Font optimization
    fonts: {
      preload: ['Inter-Regular', 'Inter-Medium'],
      subset: NODE_ENV === 'production',
    },
  },

  // Development server optimizations
  devServer: {
    // Hot reloading settings
    hotReload: {
      enabled: true,
      overlay: false, // Disable error overlay for faster reloads
    },
    // Compression
    compression: true,
    // Keep alive connections
    keepAlive: true,
    // Reduce server overhead
    stats: 'minimal',
  },

  // Bundle analyzer (for performance monitoring)
  bundleAnalyzer: {
    enabled: process.env.ANALYZE === 'true',
    openAnalyzer: false,
    generateStatsFile: true,
  },

  // Performance monitoring
  monitoring: {
    enabled: process.env.PERFORMANCE_MONITOR === 'true',
    logFile: path.join(__dirname, 'build-performance.json'),
    metrics: {
      buildTime: true,
      bundleSize: true,
      cacheHitRate: true,
      memoryUsage: true,
    },
  },
};

// Export configuration based on environment
module.exports = {
  ...performanceConfig,
  
  // Environment-specific overrides
  ...(NODE_ENV === 'development' && {
    // Development overrides for maximum speed
    sourceMaps: {
      ...performanceConfig.sourceMaps,
      development: { enabled: false },
    },
    optimization: {
      ...performanceConfig.optimization,
      skipTypeCheck: true,
      minification: {
        development: false,
        production: false,
      },
    },
  }),

  ...(NODE_ENV === 'production' && {
    // Production overrides for optimized builds
    parallel: {
      ...performanceConfig.parallel,
      workers: Math.min(OPTIMAL_WORKERS * 1.5, 12), // Use more workers in production
    },
    memory: {
      ...performanceConfig.memory,
      nodeOptions: [
        '--max-old-space-size=8192', // 8GB for production builds
        '--optimize-for-size',
      ],
    },
  }),
};

// Log performance configuration on load
if (process.env.NODE_ENV !== 'test') {
  logger.info('BUILD', 'Performance optimizations loaded:', {
    workers: performanceConfig.parallel.workers,
    memory: performanceConfig.memory.nodeOptions[0],
    sourceMaps: NODE_ENV === 'development' ? 'disabled' : 'enabled',
    cache: performanceConfig.cache.metro.enabled ? 'enabled' : 'disabled',
    environment: NODE_ENV
  });
}