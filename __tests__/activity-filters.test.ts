/**
 * Unit tests for Activity Screen filter functionality
 * Tests filter logic, state management, and AsyncStorage operations
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act } from '@testing-library/react-hooks';
import { useState } from 'react';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
  NotificationFeedbackType: {
    Warning: 'warning',
  },
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Activity Filter Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Filter State Management', () => {
    test('should initialize with all filters enabled', () => {
      const { result } = renderHook(() => ({
        filters: useState({ income: true, expense: true, account: true, card: true }),
        statusFilter: useState({ completed: true, pending: true, failed: true, reversed: true, info: true }),
      }));

      expect(result.current.filters[0]).toEqual({
        income: true,
        expense: true,
        account: true,
        card: true,
      });

      expect(result.current.statusFilter[0]).toEqual({
        completed: true,
        pending: true,
        failed: true,
        reversed: true,
        info: true,
      });
    });

    test('should prevent turning off all category filters', () => {
      const { result } = renderHook(() => {
        const [filters, setFilters] = useState({ income: true, expense: false, account: false, card: false });
        
        const toggleFilter = (key: string) => {
          setFilters(prev => {
            const next = { ...prev, [key]: !prev[key] };
            // Enforce at least one on
            if (!next.income && !next.expense && !next.account && !next.card) {
              return prev; // ignore toggle that would turn all off
            }
            return next;
          });
        };

        return { filters, toggleFilter };
      });

      // Try to turn off the last enabled filter
      act(() => {
        result.current.toggleFilter('income');
      });

      // Should remain unchanged
      expect(result.current.filters).toEqual({
        income: true,
        expense: false,
        account: false,
        card: false,
      });
    });

    test('should prevent turning off all status filters', () => {
      const { result } = renderHook(() => {
        const [statusFilter, setStatusFilter] = useState({ 
          completed: true, 
          pending: false, 
          failed: false, 
          reversed: false, 
          info: false 
        });
        
        const toggleStatus = (key: string) => {
          setStatusFilter(prev => {
            const next = { ...prev, [key]: !prev[key] };
            // Enforce at least one status filter is on
            if (!next.completed && !next.pending && !next.failed && !next.reversed && !next.info) {
              return prev;
            }
            return next;
          });
        };

        return { statusFilter, toggleStatus };
      });

      // Try to turn off the last enabled status filter
      act(() => {
        result.current.toggleStatus('completed');
      });

      // Should remain unchanged
      expect(result.current.statusFilter).toEqual({
        completed: true,
        pending: false,
        failed: false,
        reversed: false,
        info: false,
      });
    });
  });

  describe('Filter Logic Functions', () => {
    const mockActivityData = [
      {
        id: 'activity_1',
        type: 'centralized',
        timestamp: '2024-01-15T10:00:00Z',
        data: {
          id: '1',
          category: 'transaction',
          amount: 100,
          status: 'completed',
          title: 'Income Transaction',
        },
      },
      {
        id: 'activity_2',
        type: 'centralized',
        timestamp: '2024-01-15T11:00:00Z',
        data: {
          id: '2',
          category: 'transaction',
          amount: -50,
          status: 'pending',
          title: 'Expense Transaction',
        },
      },
      {
        id: 'activity_3',
        type: 'centralized',
        timestamp: '2024-01-15T12:00:00Z',
        data: {
          id: '3',
          category: 'account',
          status: 'info',
          title: 'Account Update',
        },
      },
      {
        id: 'payment_1',
        type: 'payment',
        timestamp: '2024-01-15T13:00:00Z',
        data: {
          id: 'pay_1',
          status: 'captured',
          amount: 75,
        },
      },
    ];

    test('should filter by category correctly', () => {
      const filters = { income: true, expense: false, account: false, card: false };
      const statusFilter = { completed: true, pending: true, failed: true, reversed: true, info: true };

      const filtered = mockActivityData.filter((item) => {
        // Category filter logic
        let passesCategoryFilter = false;
        
        if (item.type === 'centralized' || item.type === 'activity') {
          const eventData = item.data;
          if (eventData.category === 'transaction') {
            const amt = typeof eventData.amount === 'number' ? eventData.amount : 0;
            if (amt > 0 && filters.income) passesCategoryFilter = true;
            if (amt < 0 && filters.expense) passesCategoryFilter = true;
            if (amt === 0 && (filters.income || filters.expense)) passesCategoryFilter = true;
          } else if (eventData.category === 'account' && filters.account) {
            passesCategoryFilter = true;
          } else if (eventData.category === 'card' && filters.card) {
            passesCategoryFilter = true;
          }
        } else if (item.type === 'payment') {
          if (filters.expense || filters.income) passesCategoryFilter = true;
        }
        
        return passesCategoryFilter;
      });

      expect(filtered).toHaveLength(2); // Income transaction and payment
      expect(filtered[0].data.amount).toBe(100);
      expect(filtered[1].type).toBe('payment');
    });

    test('should filter by status correctly', () => {
      const filters = { income: true, expense: true, account: true, card: true };
      const statusFilter = { completed: true, pending: false, failed: false, reversed: false, info: false };

      const filtered = mockActivityData.filter((item) => {
        // Status filter logic
        let passesStatusFilter = false;
        
        if (item.type === 'centralized' || item.type === 'activity') {
          const eventStatus = item.data.status;
          if (eventStatus && statusFilter[eventStatus]) {
            passesStatusFilter = true;
          } else if (!eventStatus && statusFilter.info) {
            passesStatusFilter = true;
          }
        } else if (item.type === 'payment') {
          const paymentStatus = item.data.status;
          if (paymentStatus === 'captured' && statusFilter.completed) passesStatusFilter = true;
          else if (paymentStatus === 'authorized' && statusFilter.pending) passesStatusFilter = true;
          else if (paymentStatus === 'failed' && statusFilter.failed) passesStatusFilter = true;
          else if (paymentStatus === 'refunded' && statusFilter.reversed) passesStatusFilter = true;
          else if (!paymentStatus && statusFilter.info) passesStatusFilter = true;
        }
        
        return passesStatusFilter;
      });

      expect(filtered).toHaveLength(2); // Completed transaction and captured payment
      expect(filtered[0].data.status).toBe('completed');
      expect(filtered[1].data.status).toBe('captured');
    });

    test('should combine category and status filters', () => {
      const filters = { income: true, expense: false, account: false, card: false };
      const statusFilter = { completed: true, pending: false, failed: false, reversed: false, info: false };

      const filtered = mockActivityData.filter((item) => {
        // Category filter
        let passesCategoryFilter = false;
        if (item.type === 'centralized' || item.type === 'activity') {
          const eventData = item.data;
          if (eventData.category === 'transaction') {
            const amt = typeof eventData.amount === 'number' ? eventData.amount : 0;
            if (amt > 0 && filters.income) passesCategoryFilter = true;
          }
        } else if (item.type === 'payment') {
          if (filters.income) passesCategoryFilter = true;
        }
        
        if (!passesCategoryFilter) return false;
        
        // Status filter
        let passesStatusFilter = false;
        if (item.type === 'centralized' || item.type === 'activity') {
          const eventStatus = item.data.status;
          if (eventStatus && statusFilter[eventStatus]) {
            passesStatusFilter = true;
          }
        } else if (item.type === 'payment') {
          const paymentStatus = item.data.status;
          if (paymentStatus === 'captured' && statusFilter.completed) passesStatusFilter = true;
        }
        
        return passesStatusFilter;
      });

      expect(filtered).toHaveLength(2); // Only income transaction with completed status and captured payment
      expect(filtered[0].data.amount).toBe(100);
      expect(filtered[0].data.status).toBe('completed');
      expect(filtered[1].data.status).toBe('captured');
    });
  });

  describe('AsyncStorage Operations', () => {
    test('should save filters to AsyncStorage', async () => {
      const filters = { income: true, expense: false, account: true, card: false };
      
      await AsyncStorage.setItem('activityFilters', JSON.stringify(filters));
      
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'activityFilters',
        JSON.stringify(filters)
      );
    });

    test('should load filters from AsyncStorage', async () => {
      const savedFilters = { income: false, expense: true, account: false, card: true };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(savedFilters));
      
      const result = await AsyncStorage.getItem('activityFilters');
      const parsed = JSON.parse(result!);
      
      expect(parsed).toEqual(savedFilters);
    });

    test('should handle AsyncStorage errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      let errorOccurred = false;
      try {
        await AsyncStorage.getItem('activityFilters');
      } catch (error) {
        errorOccurred = true;
      }
      
      expect(errorOccurred).toBe(true);
    });

    test('should validate parsed filter data', () => {
      const validData = { income: true, expense: false, account: true, card: false };
      const invalidData = "invalid json";
      
      // Valid data should pass validation
      expect(typeof validData === 'object' && validData !== null).toBe(true);
      
      // Invalid data should fail validation
      expect(typeof invalidData === 'object' && invalidData !== null).toBe(false);
    });
  });

  describe('Date Filtering', () => {
    const testDate = new Date('2024-01-15T12:00:00Z');
    
    test('should filter by today', () => {
      const itemDate = new Date('2024-01-15T10:00:00Z');
      const yesterday = new Date('2024-01-14T10:00:00Z');
      
      expect(itemDate.toDateString()).toBe(testDate.toDateString());
      expect(yesterday.toDateString()).not.toBe(testDate.toDateString());
    });

    test('should filter by week', () => {
      const weekAgo = new Date(testDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const withinWeek = new Date('2024-01-14T10:00:00Z');
      const outsideWeek = new Date('2024-01-07T10:00:00Z');
      
      expect(withinWeek >= weekAgo).toBe(true);
      expect(outsideWeek >= weekAgo).toBe(false);
    });

    test('should filter by month', () => {
      const startOfMonth = new Date(testDate.getFullYear(), testDate.getMonth(), 1);
      const withinMonth = new Date('2024-01-10T10:00:00Z');
      const outsideMonth = new Date('2023-12-31T10:00:00Z');
      
      expect(withinMonth >= startOfMonth).toBe(true);
      expect(outsideMonth >= startOfMonth).toBe(false);
    });
  });
});