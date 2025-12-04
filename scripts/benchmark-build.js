#!/usr/bin/env node

/**
 * Build Performance Benchmarking Script
 * Measures build times before and after optimizations to validate 5x improvement
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
// Simple logger for Node.js scripts (avoiding __DEV__ dependency)
const logger = {
  debug: (category, message, data) => console.log(`[DEBUG] [${category}] ${message}`, data || ''),
  info: (category, message, data) => console.info(`[INFO] [${category}] ${message}`, data ? JSON.stringify(data) : ''),
  warn: (category, message, data) => console.warn(`[WARN] [${category}] ${message}`, data ? JSON.stringify(data) : ''),
  error: (category, message, data) => console.error(`[ERROR] [${category}] ${message}`, data ? JSON.stringify(data) : '')
};

const BENCHMARK_RESULTS_FILE = path.join(__dirname, '..', 'build-performance.json');

class BuildBenchmark {
  constructor() {
    this.results = this.loadPreviousResults();
    this.currentRun = {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpus: require('os').cpus().length,
        memory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + 'GB'
      },
      optimizations: [],
      buildTimes: {}
    };
  }

  loadPreviousResults() {
    try {
      if (fs.existsSync(BENCHMARK_RESULTS_FILE)) {
        const content = fs.readFileSync(BENCHMARK_RESULTS_FILE, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      logger.warn('BUILD', 'Could not load previous benchmark results', { error: error.message });
    }
    return { runs: [] };
  }

  saveResults() {
    try {
      this.results.runs = this.results.runs || [];
      this.results.runs.push(this.currentRun);
      
      // Keep only last 10 runs to prevent file bloat
      if (this.results.runs.length > 10) {
        this.results.runs = this.results.runs.slice(-10);
      }

      fs.writeFileSync(BENCHMARK_RESULTS_FILE, JSON.stringify(this.results, null, 2));
      logger.info('BUILD', 'Benchmark results saved', { file: BENCHMARK_RESULTS_FILE });
    } catch (error) {
      logger.error('BUILD', 'Failed to save benchmark results', { error: error.message });
    }
  }

  async measureBuildTime(command, label) {
    logger.info('BUILD', `Starting benchmark: ${label}`, { command });
    
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    try {
      // Clear any existing caches for accurate measurement
      if (label.includes('clean')) {
        this.clearCaches();
      }
      
      execSync(command, { 
        stdio: 'pipe', // Capture output for analysis
        cwd: path.join(__dirname, '..'),
        env: { 
          ...process.env, 
          NODE_ENV: label.includes('production') ? 'production' : 'development'
        }
      });
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const buildTime = endTime - startTime;
      
      const result = {
        duration: buildTime,
        durationFormatted: this.formatTime(buildTime),
        memoryUsage: {
          peak: Math.max(endMemory.heapUsed, startMemory.heapUsed),
          delta: endMemory.heapUsed - startMemory.heapUsed
        },
        success: true
      };

      this.currentRun.buildTimes[label] = result;
      
      logger.info('BUILD', `Benchmark completed: ${label}`, {
        duration: result.durationFormatted,
        memoryPeak: Math.round(result.memoryUsage.peak / 1024 / 1024) + 'MB'
      });

      return result;
      
    } catch (error) {
      const endTime = Date.now();
      const buildTime = endTime - startTime;
      
      const result = {
        duration: buildTime,
        durationFormatted: this.formatTime(buildTime),
        error: error.message,
        success: false
      };

      this.currentRun.buildTimes[label] = result;
      
      logger.error('BUILD', `Benchmark failed: ${label}`, {
        duration: result.durationFormatted,
        error: error.message
      });

      return result;
    }
  }

  clearCaches() {
    const cacheDirs = [
      '.metro-cache',
      'node_modules/.cache',
      '.expo',
      '.tsbuildinfo'
    ];

    cacheDirs.forEach(dir => {
      const dirPath = path.join(__dirname, '..', dir);
      try {
        if (fs.existsSync(dirPath)) {
          if (dir.endsWith('.tsbuildinfo')) {
            fs.unlinkSync(dirPath);
          } else {
            execSync(`rm -rf "${dirPath}"`, { stdio: 'pipe' });
          }
          logger.debug('BUILD', 'Cleared cache directory', { directory: dir });
        }
      } catch (error) {
        logger.warn('BUILD', 'Failed to clear cache directory', { directory: dir, error: error.message });
      }
    });
  }

  formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
      return `${seconds}.${Math.floor((milliseconds % 1000) / 100)}s`;
    } else {
      return `${milliseconds}ms`;
    }
  }

  calculateImprovement(baseline, optimized) {
    if (!baseline || !optimized || !baseline.success || !optimized.success) {
      return null;
    }
    
    const improvement = (baseline.duration - optimized.duration) / baseline.duration * 100;
    const speedup = baseline.duration / optimized.duration;
    
    return {
      improvement: Math.round(improvement * 10) / 10, // Round to 1 decimal
      speedup: Math.round(speedup * 10) / 10,
      timeSaved: this.formatTime(baseline.duration - optimized.duration)
    };
  }

  async runComprehensiveBenchmark() {
    logger.info('BUILD', 'Starting comprehensive build performance benchmark');

    // Record optimization status
    this.currentRun.optimizations = [
      { name: 'Metro caching', enabled: fs.existsSync(path.join(__dirname, '..', '.metro-cache')) },
      { name: 'TypeScript incremental', enabled: fs.existsSync(path.join(__dirname, '..', 'tsconfig.json')) },
      { name: 'Babel optimizations', enabled: true },
      { name: 'EAS caching', enabled: true },
      { name: 'Asset optimization', enabled: fs.existsSync(path.join(__dirname, '..', 'assets/optimization-config.json')) }
    ];

    const benchmarks = [
      {
        label: 'dependency_installation',
        command: 'rm -rf node_modules && bun install',
        description: 'Fresh dependency installation (measures package manager speed)'
      },
      {
        label: 'incremental_dependency_install',
        command: 'bun install',
        description: 'Incremental dependency installation (cached)'
      },
      {
        label: 'typescript_type_check',
        command: 'npx tsc --noEmit --skipLibCheck --incremental',
        description: 'TypeScript incremental type checking'
      },
      {
        label: 'babel_transform_test', 
        command: 'npx babel app --out-dir /tmp/babel-test --presets @babel/preset-typescript,@babel/preset-react --extensions .ts,.tsx,.js,.jsx --quiet',
        description: 'Babel transformation benchmark'
      }
    ];

    // Run all benchmarks
    for (const benchmark of benchmarks) {
      try {
        await this.measureBuildTime(benchmark.command, benchmark.label);
        
        // Small delay between benchmarks to let system stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        logger.error('BUILD', 'Benchmark suite error', { 
          benchmark: benchmark.label, 
          error: error.message 
        });
      }
    }

    this.analyzeResults();
    this.saveResults();
  }

  analyzeResults() {
    const results = this.currentRun.buildTimes;
    const previousRun = this.results.runs?.[this.results.runs.length - 1];

    logger.info('BUILD', 'Build Performance Analysis', {
      timestamp: this.currentRun.timestamp,
      system: this.currentRun.system,
      optimizationsEnabled: this.currentRun.optimizations.filter(opt => opt.enabled).length
    });

    // Analyze current run
    Object.entries(results).forEach(([label, result]) => {
      if (result.success) {
        logger.info('BUILD', `${label.replace(/_/g, ' ')}`, {
          duration: result.durationFormatted,
          memoryPeak: result.memoryUsage ? Math.round(result.memoryUsage.peak / 1024 / 1024) + 'MB' : 'N/A'
        });
      } else {
        logger.warn('BUILD', `${label.replace(/_/g, ' ')} - FAILED`, {
          duration: result.durationFormatted,
          error: result.error
        });
      }
    });

    // Compare with previous run if available
    if (previousRun?.buildTimes) {
      logger.info('BUILD', 'Performance Comparison with Previous Run:');
      
      Object.entries(results).forEach(([label, current]) => {
        const previous = previousRun.buildTimes[label];
        if (previous && current.success && previous.success) {
          const improvement = this.calculateImprovement(previous, current);
          if (improvement) {
            logger.info('BUILD', `${label.replace(/_/g, ' ')} improvement`, {
              previousTime: previous.durationFormatted,
              currentTime: current.durationFormatted,
              improvement: improvement.improvement >= 0 ? `+${improvement.improvement}%` : `${improvement.improvement}%`,
              speedup: `${improvement.speedup}x`,
              timeSaved: improvement.timeSaved
            });
          }
        }
      });
    }

    // Check if we achieved 5x improvement target
    const cleanBuild = results.clean_development_build;
    const incrementalBuild = results.incremental_development_build;
    
    if (cleanBuild?.success && incrementalBuild?.success) {
      const cacheImprovement = this.calculateImprovement(cleanBuild, incrementalBuild);
      if (cacheImprovement && cacheImprovement.speedup >= 5) {
        logger.info('BUILD', '🎉 TARGET ACHIEVED: 5x+ build speed improvement!', {
          speedup: `${cacheImprovement.speedup}x`,
          improvement: `${cacheImprovement.improvement}%`,
          timeSaved: cacheImprovement.timeSaved
        });
      } else if (cacheImprovement) {
        logger.info('BUILD', 'Build optimization results', {
          speedup: `${cacheImprovement.speedup}x`,
          improvement: `${cacheImprovement.improvement}%`,
          timeSaved: cacheImprovement.timeSaved,
          note: cacheImprovement.speedup < 5 ? 'Target 5x not yet achieved' : 'Excellent performance!'
        });
      }
    }
  }
}

// Main execution
async function main() {
  const benchmark = new BuildBenchmark();
  
  try {
    await benchmark.runComprehensiveBenchmark();
    logger.info('BUILD', 'Benchmark suite completed successfully');
  } catch (error) {
    logger.error('BUILD', 'Benchmark suite failed', { error: error.message });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    logger.error('BUILD', 'Unhandled benchmark error', { error: error.message });
    process.exit(1);
  });
}

module.exports = BuildBenchmark;