/**
 * TypeScript interface definitions for Activity Filter system
 * Provides type safety and documentation for filter-related components
 */

import type { ChipTone } from '@/theme/variants';
import type { ThemeColors } from '@/context/ThemeContext';
import type { ActivityEvent } from '@/types/activity';

/**
 * Category filter state interface
 * Controls which types of activities are displayed
 */
export interface CategoryFilters {
  /** Show income transactions (positive amounts) */
  income: boolean;
  /** Show expense transactions (negative amounts) */
  expense: boolean;
  /** Show account-related activities */
  account: boolean;
  /** Show card-related activities */
  card: boolean;
}

/**
 * Status filter state interface
 * Controls which activity statuses are displayed
 */
export interface StatusFilters {
  /** Show completed/successful activities */
  completed: boolean;
  /** Show pending/in-progress activities */
  pending: boolean;
  /** Show failed activities */
  failed: boolean;
  /** Show reversed/refunded activities */
  reversed: boolean;
  /** Show informational activities */
  info: boolean;
}

/**
 * Date filter options
 * Controls the time range for activity filtering
 */
export type DateFilterOption = 'all' | 'today' | 'week' | 'month' | 'year';

/**
 * Activity item interface for the unified activity list
 */
export interface ActivityItem {
  /** Unique identifier for the activity */
  id: string;
  /** Type of activity source */
  type: 'activity' | 'transaction' | 'payment' | 'centralized';
  /** ISO timestamp string */
  timestamp: string;
  /** Activity data (varies by type) */
  data: any;
}

/**
 * Filter button component props
 */
export interface FilterButtonProps {
  /** Unique key for the filter */
  filterKey: string;
  /** Whether the filter is currently selected */
  isSelected: boolean;
  /** Display label for the filter */
  label: string;
  /** Optional icon component */
  icon?: React.ReactNode;
  /** Visual tone/theme for the button */
  tone: ChipTone;
  /** Callback function when filter is toggled */
  onToggle: (key: string) => void;
  /** Theme colors object */
  colors: ThemeColors;
  /** Optional accessibility hint */
  accessibilityHint?: string;
}

/**
 * Payment status mapping for filter system
 */
export const PAYMENT_STATUS_MAP: Record<string, keyof StatusFilters> = {
  captured: 'completed',
  authorized: 'pending',
  failed: 'failed',
  refunded: 'reversed',
} as const;

/**
 * Default filter states
 */
export const DEFAULT_CATEGORY_FILTERS: CategoryFilters = {
  income: true,
  expense: true,
  account: true,
  card: true,
} as const;

export const DEFAULT_STATUS_FILTERS: StatusFilters = {
  completed: true,
  pending: true,
  failed: true,
  reversed: true,
  info: true,
} as const;

/**
 * AsyncStorage keys for filter persistence
 */
export const FILTER_STORAGE_KEYS = {
  CATEGORY_FILTERS: 'activityFilters',
  TYPE_FILTERS: 'txTypeFilter', // Legacy
  STATUS_FILTERS: 'txStatusFilter',
} as const;

/**
 * Filter validation utility types
 */
export type CategoryFilterKey = keyof CategoryFilters;
export type StatusFilterKey = keyof StatusFilters;

/**
 * Filter function type definitions
 */
export type CategoryFilterFunction = (key: CategoryFilterKey) => void;
export type StatusFilterFunction = (key: StatusFilterKey) => void;

/**
 * Filter persistence configuration
 */
export interface FilterPersistenceConfig {
  /** Debounce delay in milliseconds */
  debounceDelay: number;
  /** Whether to validate data on load */
  validateOnLoad: boolean;
  /** Whether to handle errors gracefully */
  gracefulErrorHandling: boolean;
}

export const DEFAULT_PERSISTENCE_CONFIG: FilterPersistenceConfig = {
  debounceDelay: 500,
  validateOnLoad: true,
  gracefulErrorHandling: true,
} as const;

/**
 * Filter combination result interface
 */
export interface FilterResult {
  /** Filtered activity items */
  items: ActivityItem[];
  /** Total count before filtering */
  totalCount: number;
  /** Filtered count */
  filteredCount: number;
  /** Applied filter criteria */
  appliedFilters: {
    category: CategoryFilters;
    status: StatusFilters;
    dateRange: DateFilterOption;
  };
}

/**
 * Filter performance metrics
 */
export interface FilterMetrics {
  /** Filter calculation time in milliseconds */
  calculationTime: number;
  /** Number of items processed */
  itemsProcessed: number;
  /** Memory usage before/after */
  memoryUsage?: {
    before: number;
    after: number;
  };
}

/**
 * Activity filter context interface
 */
export interface ActivityFilterContext {
  /** Current category filters */
  categoryFilters: CategoryFilters;
  /** Current status filters */
  statusFilters: StatusFilters;
  /** Current date filter */
  dateFilter: DateFilterOption;
  /** Toggle category filter function */
  toggleCategoryFilter: CategoryFilterFunction;
  /** Toggle status filter function */
  toggleStatusFilter: StatusFilterFunction;
  /** Set date filter function */
  setDateFilter: (filter: DateFilterOption) => void;
  /** Reset all category filters to default */
  resetCategoryFilters: () => void;
  /** Reset all status filters to default */
  resetStatusFilters: () => void;
  /** Filtered activities */
  filteredActivities: ActivityItem[];
  /** Filter metrics */
  metrics?: FilterMetrics;
}

/**
 * Error types for filter operations
 */
export class FilterError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message);
    this.name = 'FilterError';
  }
}

export class FilterPersistenceError extends FilterError {
  constructor(message: string, context?: any) {
    super(message, 'FILTER_PERSISTENCE_ERROR', context);
  }
}

export class FilterValidationError extends FilterError {
  constructor(message: string, context?: any) {
    super(message, 'FILTER_VALIDATION_ERROR', context);
  }
}

/**
 * Utility type guards
 */
export function isCategoryFilterKey(key: string): key is CategoryFilterKey {
  return key in DEFAULT_CATEGORY_FILTERS;
}

export function isStatusFilterKey(key: string): key is StatusFilterKey {
  return key in DEFAULT_STATUS_FILTERS;
}

export function isValidCategoryFilters(obj: any): obj is CategoryFilters {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.income === 'boolean' &&
    typeof obj.expense === 'boolean' &&
    typeof obj.account === 'boolean' &&
    typeof obj.card === 'boolean'
  );
}

export function isValidStatusFilters(obj: any): obj is StatusFilters {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.completed === 'boolean' &&
    typeof obj.pending === 'boolean' &&
    typeof obj.failed === 'boolean' &&
    typeof obj.reversed === 'boolean' &&
    typeof obj.info === 'boolean'
  );
}

/**
 * Filter utility functions type definitions
 */
export interface FilterUtils {
  /** Validate filter state */
  validateFilters: (
    categoryFilters: Partial<CategoryFilters>,
    statusFilters: Partial<StatusFilters>
  ) => boolean;
  /** Ensure at least one filter is active */
  ensureActiveFilters: (filters: CategoryFilters | StatusFilters) => boolean;
  /** Calculate filter hash for memoization */
  calculateFilterHash: (
    categoryFilters: CategoryFilters,
    statusFilters: StatusFilters,
    dateFilter: DateFilterOption
  ) => string;
  /** Apply filters to activity list */
  applyFilters: (
    activities: ActivityItem[],
    categoryFilters: CategoryFilters,
    statusFilters: StatusFilters,
    dateFilter: DateFilterOption
  ) => FilterResult;
}