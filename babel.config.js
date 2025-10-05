module.exports = function (api) {
  // Enhanced caching strategy for 5x faster builds
  const isProduction = api.env('production');
  const isDevelopment = api.env('development');
  
  // Aggressive caching based on environment and key files
  api.cache.using(() => {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    
    // Create cache key based on critical files
    const criticalFiles = [
      path.join(__dirname, 'package.json'),
      path.join(__dirname, 'app.json'),
      path.join(__dirname, 'metro.config.js'),
    ];
    
    const fileHashes = criticalFiles.map(file => {
      try {
        return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
      } catch {
        return 'missing';
      }
    });
    
    return `${process.env.NODE_ENV}-${fileHashes.join('-')}`;
  });

  // Load Appwrite public env from server/.env if EXPO_PUBLIC_* are not set
  try {
    const fs = require('fs');
    const path = require('path');
    const dotenv = require('dotenv');
    const envPath = path.resolve(__dirname, 'server/.env');
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.parse(fs.readFileSync(envPath));
      const map = {
        EXPO_PUBLIC_APPWRITE_ENDPOINT: 'APPWRITE_ENDPOINT',
        EXPO_PUBLIC_APPWRITE_PROJECT_ID: 'APPWRITE_PROJECT_ID',
        EXPO_PUBLIC_APPWRITE_PLATFORM: 'APPWRITE_PLATFORM',
        EXPO_PUBLIC_APPWRITE_DATABASE_ID: 'APPWRITE_DATABASE_ID',
        EXPO_PUBLIC_APPWRITE_USER_COLLECTION_ID: 'APPWRITE_USER_COLLECTION_ID',
        EXPO_PUBLIC_APPWRITE_TRANSACTIONS_COLLECTION_ID: 'APPWRITE_TRANSACTIONS_COLLECTION_ID',
        EXPO_PUBLIC_APPWRITE_CARDS_COLLECTION_ID: 'APPWRITE_CARDS_COLLECTION_ID',
        EXPO_PUBLIC_APPWRITE_ACCOUNT_UPDATES_COLLECTION_ID: 'APPWRITE_ACCOUNT_UPDATES_COLLECTION_ID',
      };
      for (const [expoKey, serverKey] of Object.entries(map)) {
        if (!process.env[expoKey] && parsed[serverKey]) {
          process.env[expoKey] = parsed[serverKey];
        }
      }
    }
  } catch (e) {
    // Ignore any dotenv errors in dev
  }

  const baseConfig = {
    presets: [
      [
        "babel-preset-expo", 
        { 
          jsxImportSource: "nativewind",
          // Optimize for faster builds
          unstable_transformProfile: isProduction ? 'default' : 'hermes-stable',
          // Enable JSX runtime optimization
          jsxRuntime: 'automatic',
        }
      ],
      [
        "nativewind/babel",
        {
          // NativeWind performance optimizations
          mode: isDevelopment ? 'compileOnly' : 'transformOnly',
        }
      ],
    ],
    plugins: [
      // Production optimizations
      ...(isProduction ? [
        // Remove development-only code
        ['transform-remove-console', { exclude: ['error', 'warn'] }],
      ] : []),
      
      // Development optimizations
      ...(isDevelopment ? [
        // Fast refresh support
        ['react-refresh/babel', { skipEnvCheck: true }],
      ] : []),
      
      // Universal optimizations
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      ['@babel/plugin-transform-flow-strip-types'],
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
          },
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      ],
    ],
    // Performance optimizations
    compact: isProduction,
    minified: isProduction,
    comments: !isProduction,
    // Parallel processing when possible
    sourceType: 'unambiguous',
  };

  return baseConfig;
};
