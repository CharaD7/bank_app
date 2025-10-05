import { logger } from '@/lib/logger';
import { Filter, ArrowDownLeft, ArrowUpRight, User, CreditCard as CardIcon, CreditCard, RefreshCw } from "lucide-react-native";
import { MaterialIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from "react";
import { 
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	View,
	TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateFilterModal } from "@/components/DateFilterModal";
import ActivityLogItem from "@/components/activity/ActivityLogItem";
import ActivityDetailModal from "@/components/activity/ActivityDetailModal";
import { ClearDataModal } from "@/components/ClearDataModal";
import { useTheme } from "@/context/ThemeContext";
import { useAlert } from "@/context/AlertContext";
import { useBiometricToast } from "@/context/BiometricToastContext";
import CustomButton from "@/components/CustomButton";
import { getBadgeVisuals } from "@/theme/badge-utils";
import type { ChipTone } from "@/theme/variants";
import { TransactionItem } from "@/components/TransactionItem";
import { useApp } from "@/context/AppContext";
import { ActivityEvent } from "@/types/activity";
import { Transaction } from "@/constants/index";
import { activityService } from '@/lib/appwrite';
import { activityLogger } from '@/lib/activityLogger';
import LoadingAnimation from '@/components/LoadingAnimation';
import { useLoading, LOADING_CONFIGS } from '@/hooks/useLoading';
import { getApiBase } from '@/lib/api';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useRef } from 'react';

type Payment = { id: string; status: string; amount?: number; currency?: string; created?: string };

/**
 * Memoized filter button component for optimal performance
 * Prevents unnecessary re-renders when parent component updates
 * 
 * @param filterKey - Unique identifier for the filter
 * @param isSelected - Whether the filter is currently active
 * @param label - Display text for the button
 * @param icon - Optional icon component to display
 * @param tone - Visual theme/color scheme
 * @param onToggle - Callback function when button is pressed
 * @param colors - Theme colors object
 */
const FilterButton = memo(({ 
	filterKey, 
	isSelected, 
	label, 
	icon, 
	tone, 
	onToggle,
	colors 
}: {
	filterKey: string;
	isSelected: boolean;
	label: string;
	icon?: React.ReactNode;
	tone: ChipTone;
	onToggle: (key: string) => void;
	colors: any;
}) => {
	// Calculate visual properties based on selection state and theme
	const v = getBadgeVisuals(colors, { tone, selected: isSelected, size: 'md' });
	
	// Memoized press handler to prevent function recreation on each render
	const handlePress = useCallback(() => onToggle(filterKey), [filterKey, onToggle]);
	
	return (
		<View 
			style={{ marginRight: 5 }} 
			accessibilityLabel={`${label} filter, ${isSelected ? 'selected' : 'not selected'}`}
			accessibilityRole="button"
			accessibilityHint={`Toggle ${label.toLowerCase()} filter`}
		>
			<CustomButton
				size="sm"
				isFilterAction
				variant={v.textColor === '#fff' ? 'primary' : 'secondary'}
				onPress={handlePress}
				title={label}
				leftIcon={icon}
				style={{ backgroundColor: v.backgroundColor, borderColor: v.borderColor, borderWidth: 1 }}
				textStyle={{ color: v.textColor }}
			/>
		</View>
	);
});

export default function ActivityScreen() {

	const { transactions, activity, clearAllActivity, deleteActivity } = useApp();
	const { showAlert } = useAlert();
	const { showSuccess, showError } = useBiometricToast();
	const { loading, withLoading, showLoading, hideLoading } = useLoading();
	
	// State for centralized activities from activityLogger
	const [centralizedActivities, setCentralizedActivities] = React.useState<any[]>([]);
	
	// No mock data - use real data only
	const [suppressAllLogs, setSuppressAllLogs] = useState(false);
	const [activitySuppressed, setActivitySuppressed] = useState(false);
	const [payments, setPayments] = React.useState<Payment[]>([]);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [showClearActivity, setShowClearActivity] = React.useState(false);
	const [isClearingActivity, setIsClearingActivity] = React.useState(false);
	
	// Auto-refresh state
	const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(true);
	const [lastRefreshTime, setLastRefreshTime] = React.useState<Date>(new Date());
	const refreshIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
	const PAY_PAGE_SIZE = 10;
	const [nextPaymentsCursor, setNextPaymentsCursor] = React.useState<string | null>(null);
	
	// Debounced save references for performance
	const saveFiltersTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const saveTypeFilterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const saveStatusFilterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	
	// Debounced save function to batch AsyncStorage operations
	const debouncedSave = useCallback((key: string, data: any, timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>, delay: number = 500) => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}
		timeoutRef.current = setTimeout(async () => {
			try {
				await AsyncStorage.setItem(key, JSON.stringify(data));
				logger.debug('ACTIVITY', `Saved ${key}`, data);
			} catch (error) {
				logger.warn('ACTIVITY', `Failed to save ${key}:`, error);
			}
		}, delay);
	}, []);

	// Maps Activity screen status chips to payment statuses
	const paymentStatusMap: Record<string, string> = {
		completed: 'captured',
		pending: 'authorized',
		failed: 'failed',
		reversed: 'refunded',
	};

    

    

	// Function to load centralized activities
	const loadCentralizedActivities = async (showLogs = true) => {
		try {
			const activities = await activityLogger.getActivities({ limit: 100 });
			setCentralizedActivities(activities);
			if (showLogs) {
				logger.info('ACTIVITY', 'Loaded centralized activities', { count: activities.length });
			}
		} catch (error) {
			logger.error('ACTIVITY', 'Failed to load centralized activities:', error);
		}
	};

	// Refresh activities (called when user navigates to screen)
	const refreshActivities = async (showLogs: boolean = false) => {
		if (showLogs) {
			logger.info('ACTIVITY', 'Refreshing activities manually');
		}
		await loadCentralizedActivities(showLogs);
		setLastRefreshTime(new Date());
		// Note: fetchPayments will be called later, we just refresh centralized activities here
	};
	
	// Auto-refresh function
	const performAutoRefresh = React.useCallback(async () => {
		if (!autoRefreshEnabled) return;
		
		try {
			logger.info('ACTIVITY', 'Auto-refreshing activity data');
			await loadCentralizedActivities(false);
			// Also refresh payments to ensure consistency
			await fetchPayments(false);
			setLastRefreshTime(new Date());
		} catch (error) {
			logger.error('ACTIVITY', 'Auto-refresh failed:', error);
		}
	}, [autoRefreshEnabled]);
	
	// Setup auto-refresh timer
	const setupAutoRefresh = React.useCallback(() => {
		if (refreshIntervalRef.current) {
			clearInterval(refreshIntervalRef.current);
		}
		
		if (autoRefreshEnabled) {
			refreshIntervalRef.current = setInterval(performAutoRefresh, 30000); // Refresh every 30 seconds
			logger.info('ACTIVITY', 'Auto-refresh enabled: 30-second interval');
		} else {
			logger.info('ACTIVITY', 'Auto-refresh disabled');
		}
	}, [autoRefreshEnabled, performAutoRefresh]);
	
	// Cleanup auto-refresh and debounced timeouts on unmount
	React.useEffect(() => {
		return () => {
			if (refreshIntervalRef.current) {
				clearInterval(refreshIntervalRef.current);
				refreshIntervalRef.current = null;
			}
			// Clear debounced save timeouts
			if (saveFiltersTimeoutRef.current) {
				clearTimeout(saveFiltersTimeoutRef.current);
			}
			if (saveTypeFilterTimeoutRef.current) {
				clearTimeout(saveTypeFilterTimeoutRef.current);
			}
			if (saveStatusFilterTimeoutRef.current) {
				clearTimeout(saveStatusFilterTimeoutRef.current);
			}
		};
	}, []);
	
	// Toggle auto-refresh
	const toggleAutoRefresh = () => {
		setAutoRefreshEnabled(prev => {
			const newState = !prev;
			logger.info('ACTIVITY', 'Auto-refresh toggled:', newState ? 'enabled' : 'disabled');
			return newState;
		});
	};
	
	// Setup auto-refresh whenever the enabled state changes
	React.useEffect(() => {
		setupAutoRefresh();
	}, [setupAutoRefresh]);

	React.useEffect(() => {
		// Check if activity was manually cleared and suppress if needed
		(async () => {
			try {
				const activityClearedFlag = await AsyncStorage.getItem('activity_manually_cleared');
				if (activityClearedFlag) {
					logger.info('UI', 'Activity is suppressed, hiding logs');
					setActivitySuppressed(true);
					setSuppressAllLogs(true);
				}
			} catch (error) {
				logger.error('UI', 'Failed to check activity suppression flag:', error);
			}
		})();

		// Load centralized activities
		loadCentralizedActivities();

		// initial load will be triggered by fetchPayments below
	}, []);

	// Refresh activities when screen comes into focus
	useFocusEffect(
		React.useCallback(() => {
			refreshActivities();
		}, [])
	);

    
	const { colors } = useTheme();
	const [showDateFilter, setShowDateFilter] = useState(false);
	const [dateFilter, setDateFilter] = useState("all");
	const [filters, setFilters] = useState({ income: true, expense: true, account: true, card: true });
	const [typeFilter, setTypeFilter] = useState({ deposit: true, transfer: true, withdraw: true, payment: true });
	const [statusFilter, setStatusFilter] = useState({ completed: true, pending: true, failed: true, reversed: true, info: true });

	// Load saved category filters on mount
	React.useEffect(() => {
		(async () => {
			try {
				const raw = await AsyncStorage.getItem('activityFilters');
				if (raw) {
					const parsed = JSON.parse(raw);
					// Validate parsed data has expected structure
					if (parsed && typeof parsed === 'object') {
						setFilters((prev) => ({ ...prev, ...parsed }));
						logger.info('ACTIVITY', 'Loaded saved category filters', parsed);
					}
				}
			} catch (error) {
				logger.warn('ACTIVITY', 'Failed to load saved category filters:', error);
			}
		})();
	}, []);

	// Save category filters when they change (debounced)
	React.useEffect(() => {
		debouncedSave('activityFilters', filters, saveFiltersTimeoutRef);
	}, [filters, debouncedSave]);

	// Load saved type and status filters on mount
	React.useEffect(() => {
		(async () => {
			try {
				const t = await AsyncStorage.getItem('txTypeFilter');
				if (t) {
					const parsedType = JSON.parse(t);
					if (parsedType && typeof parsedType === 'object') {
						setTypeFilter(prev => ({ ...prev, ...parsedType }));
						logger.info('ACTIVITY', 'Loaded saved type filters', parsedType);
					}
				}
				const s = await AsyncStorage.getItem('txStatusFilter');
				if (s) {
					const parsedStatus = JSON.parse(s);
					if (parsedStatus && typeof parsedStatus === 'object') {
						setStatusFilter(prev => ({ ...prev, ...parsedStatus }));
						logger.info('ACTIVITY', 'Loaded saved status filters', parsedStatus);
					}
				}
			} catch (error) {
				logger.warn('ACTIVITY', 'Failed to load saved type/status filters:', error);
			}
		})();
	}, []);
	
	// Save type filters when they change (debounced)
	React.useEffect(() => {
		debouncedSave('txTypeFilter', typeFilter, saveTypeFilterTimeoutRef);
	}, [typeFilter, debouncedSave]);
	
	// Save status filters when they change (debounced)
	React.useEffect(() => {
		debouncedSave('txStatusFilter', statusFilter, saveStatusFilterTimeoutRef);
	}, [statusFilter, debouncedSave]);

	const toggleFilter = useCallback((key: keyof typeof filters) => {
		setFilters(prev => {
			const next = { ...prev, [key]: !prev[key] };
			// Enforce at least one on
			if (!next.income && !next.expense && !next.account && !next.card) {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
				return prev; // ignore toggle that would turn all off
			}
			// Provide haptic feedback for successful toggle
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			return next;
		});
	}, []);

	// toggleType removed (not used) to satisfy linter

	const toggleStatus = useCallback((key: keyof typeof statusFilter) => {
		setStatusFilter(prev => {
			const next = { ...prev, [key]: !prev[key] };
			// Enforce at least one status filter is on
			if (!next.completed && !next.pending && !next.failed && !next.reversed && !next.info) {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
				return prev;
			}
			// Provide haptic feedback for successful toggle
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			return next;
		});
	}, []);

	const setAllOn = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		setFilters({ income: true, expense: true, account: true, card: true });
	}, []);

	const handleClearActivity = async () => {
		try {
			setShowClearActivity(false);
			
			// Use withLoading to handle the loading state properly
			await withLoading(async () => {
				try {
					logger.info('ACTIVITY', 'Starting clear all activity operation...');
					
					// Clear activity data
					await clearAllActivity();
					
					// Also suppress any locally loaded logs (payments/transactions) for this session
					setPayments([]);
					setSuppressAllLogs(true);
					setActivitySuppressed(true);
					
					// Clear centralized activities as well
					setCentralizedActivities([]);
					
					logger.info('ACTIVITY', 'Activity cleared successfully');
				} catch (innerError) {
					logger.error('ACTIVITY', 'Error during clear operation:', innerError);
					throw innerError; // Re-throw to be caught by outer catch
				}
			}, LOADING_CONFIGS.SYNC_DATA);
			
			// Show success toast notification
			showSuccess('Activity Cleared', 'All activity has been cleared from this session.');
			showAlert('success', 'All activity has been cleared from this session.', 'Activity Cleared');
			
		} catch (error) {
			logger.error('ACTIVITY', 'Failed to clear activity:', error);
			showError('Clear Failed', 'Failed to clear activity. Please try again.');
			showAlert('error', 'Failed to clear activity. Please try again.', 'Clear Failed');
		}
	};

	const handleCancelClearActivity = () => {
		setShowClearActivity(false);
	};

	const handleRestoreActivity = async () => {
		try {
			logger.info('UI', 'Restoring activity after clear');

			// Remove suppression flag
			await AsyncStorage.removeItem('activity_manually_cleared');
			setSuppressAllLogs(false);
			setActivitySuppressed(false);

			// Reload payments and activities
			await fetchPayments(true);
			await refreshActivities();
			
			logger.info('UI', 'Activity restored successfully');
			showAlert('success', 'Activity has been restored successfully.', 'Activity Restored');
		} catch (error) {
			logger.error('UI', 'Failed to restore activity:', error);
			showAlert('error', 'Failed to restore activity. Please try again.', 'Restore Failed');
		}
	};


	const buildPaymentsQuery = (limit: number, cursor?: string) => {
		const apiBase = getApiBase();
		const types = Object.keys(typeFilter).filter((k) => (typeFilter as any)[k]);
		const statuses = Object.keys(statusFilter)
			.filter((k) => (statusFilter as any)[k])
			.map((k) => paymentStatusMap[k] || '')
			.filter(Boolean);
		const params = new URLSearchParams();
		params.set('limit', String(limit));
		if (types.length) params.set('type', types.join(','));
		if (statuses.length) params.set('status', statuses.join(','));
		if (cursor) params.set('cursor', cursor);
		return `${apiBase.replace(/\/$/, "")}/v1/payments?${params.toString()}`;
	};

	const fetchPayments = async (reset: boolean) => {
		try {
			if (reset) {
				showLoading();
				setPayments([]);
				setNextPaymentsCursor(null);
			}
			const url = buildPaymentsQuery(PAY_PAGE_SIZE);
			const res = await fetch(url, { headers: {} });
			
			// Handle authentication errors gracefully
			if (res.status === 401) {
				logger.warn('ACTIVITY', 'Authentication failed, clearing payment data');
				setPayments([]);
				return; // Don't throw error for auth issues, just show empty state
			}
			
			const data = await res.json();
			if (!res.ok) {
				// Handle 404 or API not available gracefully
				if (res.status === 404) {
					logger.info('ACTIVITY', 'Payments API not available, showing empty state');
					setPayments([]);
					return;
				}
				throw new Error(data?.error || `HTTP ${res.status}`);
			}
			const list: Payment[] = Array.isArray(data?.data) ? data.data : [];
			setPayments(list);
			setNextPaymentsCursor(data?.nextCursor ?? null);
		} catch (e: any) {
			// Only log as warning instead of error for common cases
			if (e?.message?.includes('Failed to fetch') || e?.message?.includes('Network')) {
				logger.warn('ACTIVITY', 'Network error loading payments:', e.message);
			} else {
				logger.error('ACTIVITY', 'Error loading payments:', e.message);
			}
			// Don't set error state for auth/network issues - just show empty state
			setPayments([]);
		} finally {
			if (reset) hideLoading();
		}
	};

	const loadMorePayments = async () => {
		if (!nextPaymentsCursor || loadingMore) return;
		try {
			setLoadingMore(true);
			const url = buildPaymentsQuery(PAY_PAGE_SIZE, nextPaymentsCursor);
			const res = await fetch(url, { headers: {} });
			
			// Handle authentication errors gracefully
			if (res.status === 401) {
				logger.warn('ACTIVITY', 'Authentication failed while loading more payments');
				return; // Stop loading more if auth fails
			}
			
			const data = await res.json();
			if (!res.ok) {
				if (res.status === 404) {
					logger.info('ACTIVITY', 'No more payments available');
					return;
				}
				throw new Error(data?.error || `HTTP ${res.status}`);
			}
			const list: Payment[] = Array.isArray(data?.data) ? data.data : [];
			setPayments(prev => {
				const seen = new Set(prev.map(p => p.id));
				const merged = [...prev];
				for (const item of list) if (!seen.has(item.id)) merged.push(item);
				return merged;
			});
			setNextPaymentsCursor(data?.nextCursor ?? null);
		} catch (e: any) {
			logger.warn('ACTIVITY', 'Failed to load more payments:', e.message);
			// Don't show error message to user for load more failures
		} finally {
			setLoadingMore(false);
		}
	};

	const handleCapture = async (id: string) => {
		try {
		const apiBase = getApiBase();
		const url = `${apiBase.replace(/\/$/, "")}/v1/payments/${id}/capture`;
		const res = await fetch(url, { method: 'POST', headers: {} });
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
			setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'captured' } : p)));
		} catch {
			// ignore
		}
	};

	const handleRefund = async (id: string) => {
		try {
		const apiBase = getApiBase();
		const url = `${apiBase.replace(/\/$/, "")}/v1/payments/${id}/refund`;
		const res = await fetch(url, { method: 'POST', headers: {} });
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
			setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'refunded' } : p)));
		} catch {
			// ignore
		}
	};

	React.useEffect(() => {
		fetchPayments(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [typeFilter, statusFilter]);
	// Simplified transaction accessor - filtering is now done in unified allActivities
	const getFilteredTransactions = () => {
		// Use only real transaction data, no mock fallback
		return Array.isArray(transactions) ? transactions : [];
	};

	// Simplified activity accessor - filtering is now done in unified allActivities
	const activityCards = useMemo(() => {
		// Use only real activity data, no mock fallback
		return Array.isArray(activity) ? activity : [];
	}, [activity]);

	const [selected, setSelected] = useState<ActivityEvent | null>(null);
	const [showDetail, setShowDetail] = useState(false);

	const sourceTransactions = getFilteredTransactions();

	// Create unified, deduplicated activity list
	const allActivities = useMemo(() => {
		if (suppressAllLogs) return [];
		const items: {
			id: string;
			type: 'activity' | 'transaction' | 'payment' | 'centralized';
			timestamp: string;
			data: any;
		}[] = [];

		// Add centralized activities from activityLogger (highest priority)
		centralizedActivities.forEach(activity => {
			items.push({
				id: `centralized_${activity.id}`,
				type: 'centralized',
				timestamp: activity.timestamp,
				data: activity
			});
		});

		// Add activity cards (legacy system - lower priority)
		activityCards.forEach(evt => {
			// Don't add if we already have this from centralized activities
			const alreadyExists = items.some(item => 
				item.type === 'centralized' && 
				(item.data.transactionId === evt.transactionId || item.data.cardId === evt.cardId)
			);
			if (!alreadyExists) {
				items.push({
					id: `activity_${evt.id}`,
					type: 'activity',
					timestamp: evt.timestamp,
					data: evt
				});
			}
		});

		// Add source transactions from real data only (only if not already represented)
		sourceTransactions.forEach(tx => {
			// Check if this transaction is already represented in centralized activities
			const hasInCentralized = items.some(item => 
				item.type === 'centralized' && item.data.transactionId === tx.id
			);
			const hasActivity = activityCards.some(evt => 
				evt.transactionId === tx.id || 
				(evt.category === 'transaction' && evt.title.includes(tx.description))
			);
			if (!hasInCentralized && !hasActivity) {
				items.push({
					id: `transaction_${tx.id}`,
					type: 'transaction',
					timestamp: tx.date,
					data: tx
				});
			}
		});

		// Add payments (only if not already represented in activity or transactions)
		payments.forEach(payment => {
			const hasInCentralized = items.some(item => 
				item.type === 'centralized' && item.data.transactionId === payment.id
			);
			const hasActivity = activityCards.some(evt => 
				evt.transactionId === payment.id ||
				(evt.type && evt.type.includes('payment') && evt.title.includes(payment.id.slice(-6)))
			);
			const hasTransaction = sourceTransactions.some(tx => tx.id === payment.id);
			
			if (!hasInCentralized && !hasActivity && !hasTransaction) {
				items.push({
					id: `payment_${payment.id}`,
					type: 'payment',
					timestamp: payment.created || new Date().toISOString(),
					data: payment
				});
			}
		});

		// Sort by timestamp (most recent first) and remove duplicates by id
		const uniqueItems = items.filter((item, index, self) => 
			self.findIndex(i => i.id === item.id) === index
		);

		// Apply filters to unified items
		const filteredItems = uniqueItems.filter((item) => {
			// Date filter
			const itemDate = new Date(item.timestamp);
			const now = new Date();
			let passesDateFilter = true;
			
			switch (dateFilter) {
				case "today":
					passesDateFilter = itemDate.toDateString() === now.toDateString();
					break;
				case "week":
					const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
					passesDateFilter = itemDate >= weekAgo;
					break;
				case "month":
					const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
					passesDateFilter = itemDate >= startOfMonth;
					break;
				case "year":
					const startOfYear = new Date(now.getFullYear(), 0, 1);
					passesDateFilter = itemDate >= startOfYear;
					break;
				default:
					passesDateFilter = true;
			}
			
			if (!passesDateFilter) return false;
			
			// Category filter logic for each item type
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
			} else if (item.type === 'transaction') {
				const txData = item.data;
				if (txData.amount > 0 && filters.income) passesCategoryFilter = true;
				if (txData.amount < 0 && filters.expense) passesCategoryFilter = true;
			} else if (item.type === 'payment') {
				// Payments can be considered as transactions, categorize based on context
				if (filters.expense || filters.income) passesCategoryFilter = true;
			}
			
			if (!passesCategoryFilter) return false;
			
			// Status filter logic
			let passesStatusFilter = false;
			
			if (item.type === 'centralized' || item.type === 'activity') {
				const eventStatus = item.data.status;
				if (eventStatus && (statusFilter as any)[eventStatus]) {
					passesStatusFilter = true;
				} else if (!eventStatus && statusFilter.info) {
					// Items without status are considered "info"
					passesStatusFilter = true;
				}
			} else if (item.type === 'transaction') {
				const txStatus = item.data.status;
				if (txStatus && (statusFilter as any)[txStatus]) {
					passesStatusFilter = true;
				} else if (!txStatus && statusFilter.completed) {
					// Transactions without explicit status are usually completed
					passesStatusFilter = true;
				}
			} else if (item.type === 'payment') {
				const paymentStatus = item.data.status;
				// Map payment statuses to activity screen statuses
				if (paymentStatus === 'captured' && statusFilter.completed) passesStatusFilter = true;
				else if (paymentStatus === 'authorized' && statusFilter.pending) passesStatusFilter = true;
				else if (paymentStatus === 'failed' && statusFilter.failed) passesStatusFilter = true;
				else if (paymentStatus === 'refunded' && statusFilter.reversed) passesStatusFilter = true;
				else if (!paymentStatus && statusFilter.info) passesStatusFilter = true;
			}
			
			return passesStatusFilter;
		});
		
		return filteredItems.sort((a, b) => 
			new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		);
	}, [activityCards, sourceTransactions, payments, suppressAllLogs, centralizedActivities, filters, dateFilter, statusFilter]);

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
			<KeyboardAvoidingView
				style={styles.keyboardContainer}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				<View style={styles.header}>
					<Text style={[styles.title, { color: colors.textPrimary }]}>Activity</Text>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
						{/* Auto-refresh toggle */}
						<TouchableOpacity
							style={[styles.filterButton, { 
								backgroundColor: autoRefreshEnabled ? colors.tintPrimary : colors.card,
								borderWidth: 1,
								borderColor: autoRefreshEnabled ? colors.tintPrimary : colors.border
							}]}
							onPress={toggleAutoRefresh}
						>
							<RefreshCw 
								color={autoRefreshEnabled ? '#fff' : colors.textSecondary} 
								size={18} 
							/>
						</TouchableOpacity>
						
						{/* Filter button */}
						<TouchableOpacity
							style={[styles.filterButton, { backgroundColor: colors.card }]}
							onPress={() => setShowDateFilter(true)}
						>
							<Filter color={colors.textSecondary} size={24} />
						</TouchableOpacity>
					</View>
				</View>

				<View style={{ marginBottom: 10 }}>
				<ScrollView 
					horizontal 
					showsHorizontalScrollIndicator={false} 
					style={styles.filterTabs} 
					contentContainerStyle={styles.filterScrollContent}
					decelerationRate="fast"
					bounces={false}
					overScrollMode="never"
				>
					{(() => {
						const v = getBadgeVisuals(colors, { tone: 'neutral', size: 'md' });
						return (
							<View style={{ marginRight: 5 }}>
								<CustomButton
									title="All"
									size="sm"
									isFilterAction
									variant={v.textColor === '#fff' ? 'primary' : 'secondary'}
									onPress={setAllOn}
									style={{ backgroundColor: v.backgroundColor, borderColor: v.borderColor, borderWidth: 1 }}
									textStyle={{ color: v.textColor }}
								/>
							</View>
						);
					})()}

					{(() => {
						const v = getBadgeVisuals(colors, { tone: 'success', selected: filters.income, size: 'md' });
						return (
							<View style={{ marginRight: 5 }}>
								<View
									accessibilityLabel={`Income filter, ${filters.income ? 'selected' : 'not selected'}`}
									accessibilityRole="button"
									accessibilityHint="Toggle income transactions filter"
								>
									<CustomButton
										size="sm"
										isFilterAction
										variant={v.textColor === '#fff' ? 'primary' : 'secondary'}
										onPress={() => toggleFilter('income')}
										title="Income"
										leftIcon={<ArrowDownLeft size={14} color={v.textColor as string} />}
										style={{ backgroundColor: v.backgroundColor, borderColor: v.borderColor, borderWidth: 1 }}
										textStyle={{ color: v.textColor }}
									/>
								</View>
							</View>
						);
					})()}

					{(() => {
						const v = getBadgeVisuals(colors, { tone: 'danger', selected: filters.expense, size: 'md' });
						return (
							<View style={{ marginRight: 5 }}>
								<CustomButton
									size="sm"
									isFilterAction
									variant={v.textColor === '#fff' ? 'primary' : 'secondary'}
									onPress={() => toggleFilter('expense')}
									title="Expense"
									leftIcon={<ArrowUpRight size={14} color={v.textColor as string} />}
									style={{ backgroundColor: v.backgroundColor, borderColor: v.borderColor, borderWidth: 1 }}
									textStyle={{ color: v.textColor }}
								/>
							</View>
						);
					})()}

					{(() => {
						const v = getBadgeVisuals(colors, { tone: 'accent', selected: filters.account, size: 'md' });
						return (
							<View style={{ marginRight: 5 }}>
								<CustomButton
									size="sm"
									isFilterAction
									variant={v.textColor === '#fff' ? 'primary' : 'secondary'}
									onPress={() => toggleFilter('account')}
									title="Account"
									leftIcon={<User size={14} color={v.textColor as string} />}
									style={{ backgroundColor: v.backgroundColor, borderColor: v.borderColor, borderWidth: 1 }}
									textStyle={{ color: v.textColor }}
								/>
							</View>
						);
					})()}

					{(() => {
						const v = getBadgeVisuals(colors, { tone: 'accent', selected: filters.card, size: 'md' });
						return (
							<View style={{ marginRight: 5 }}>
								<CustomButton
									size="sm"
									isFilterAction
									variant={v.textColor === '#fff' ? 'primary' : 'secondary'}
									onPress={() => toggleFilter('card')}
									title="Cards"
									leftIcon={<CardIcon size={14} color={v.textColor as string} />}
									style={{ backgroundColor: v.backgroundColor, borderColor: v.borderColor, borderWidth: 1 }}
									textStyle={{ color: v.textColor }}
								/>
							</View>
						);
					})()}
				</ScrollView>
				</View>
				

				<View>
				{/* Activity Status Filters */}
				<View style={{ marginBottom: 10 }}>
					<ScrollView 
						horizontal 
						showsHorizontalScrollIndicator={false} 
						style={styles.filterTabs} 
						contentContainerStyle={styles.filterScrollContent}
						decelerationRate="fast"
						bounces={false}
						overScrollMode="never"
					>
						{(['completed','pending','failed','reversed','info'] as const).map(key => {
							const tone = key === 'completed' ? 'success' : 
										key === 'failed' ? 'danger' : 
										key === 'reversed' ? 'warning' :
										key === 'info' ? 'accent' : 'warning';
							const isSelected = (statusFilter as any)[key] !== false;
							const v = getBadgeVisuals(colors, { tone: tone as any, selected: isSelected, size: 'sm' });
							const title = key === 'reversed' ? 'Refunded' : key[0].toUpperCase() + key.slice(1);
							return (
								<View key={key} style={{ marginRight: 5 }}>
									<CustomButton 
										size="sm" 
										isFilterAction 
										variant={v.textColor === '#fff' ? 'primary' : 'secondary'}
										onPress={() => toggleStatus(key)}
										title={title}
										style={{ 
											backgroundColor: v.backgroundColor, 
											borderColor: v.borderColor, 
											borderWidth: 1 
										}}
										textStyle={{ color: v.textColor }}
									/>
								</View>
							);
						})}
						
						{/* Clear All Status Filters Button */}
						<View style={{ marginRight: 5 }}>
							<CustomButton 
								size="sm" 
								isFilterAction 
								variant="secondary"
								onPress={() => setStatusFilter({ completed: true, pending: true, failed: true, reversed: true, info: true })}
								title="All Status"
								style={{ 
									backgroundColor: colors.card, 
									borderColor: colors.border, 
									borderWidth: 1 
								}}
								textStyle={{ color: colors.textSecondary }}
							/>
						</View>
					</ScrollView>
				</View>
				</View>
				
				{/* Auto-refresh status */}
				{autoRefreshEnabled && (
					<View style={{ 
						flexDirection: 'row', 
						alignItems: 'center', 
						justifyContent: 'center', 
						paddingHorizontal: 16, 
						paddingVertical: 8,
						marginBottom: 8
					}}>
						<View style={{
							width: 6,
							height: 6,
							borderRadius: 3,
							backgroundColor: colors.tintPrimary,
							marginRight: 6
						}} />
						<Text style={{ 
							color: colors.textSecondary, 
							fontSize: 12, 
							fontWeight: '500'
						}}>
							Auto-refresh enabled • Last: {lastRefreshTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
						</Text>
					</View>
				)}

				<View style={[styles.transactionsContainer, { backgroundColor: colors.background }]}>
					{/* Sticky Header with Clear All Button */}
					<View style={[styles.stickyActivityHeader, { backgroundColor: colors.background }]}>
						{/* Horizontal separator bar */}
						<View style={[styles.horizontalBar, { backgroundColor: colors.border }]} />
						
					{/* Clear All Button */}
					{(!suppressAllLogs && (allActivities.length > 0 || activity.length > 0 || payments.length > 0 || centralizedActivities.length > 0)) && (
						<View style={styles.clearAllContainer}>
								<TouchableOpacity onPress={() => setShowClearActivity(true)}>
									<Text style={[styles.clearAllText, { color: colors.negative }]}>Clear All</Text>
								</TouchableOpacity>
							</View>
						)}
					</View>

					<ScrollView
						style={styles.transactionsList}
						contentContainerStyle={[styles.scrollContent, { paddingTop: 52 }]}
						showsVerticalScrollIndicator={true}
						scrollEventThrottle={16}
						alwaysBounceVertical={true}
						nestedScrollEnabled={true}
						indicatorStyle="default"
					>
						{/* Empty state when there are no activities */}
						{!loading.visible && !error && allActivities.length === 0 && (
							<View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
								<MaterialIcons name="timeline" size={64} color={colors.textSecondary} style={{ marginBottom: 16 }} />
								<Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
									{activitySuppressed ? 'Activity cleared' : 'No activities yet'}
								</Text>
								<Text style={{ marginTop: 8, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
									{activitySuppressed 
										? 'Your activity history has been cleared from this session.'
										: 'Start using your cards to see transactions, transfers and other activities here.'
									}
								</Text>
								{activitySuppressed && (
									<TouchableOpacity 
										onPress={handleRestoreActivity}
										style={{ 
											marginTop: 12, 
											paddingVertical: 8, 
											paddingHorizontal: 16, 
											backgroundColor: colors.tintPrimary, 
											borderRadius: 8 
										}}
									>
										<Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>Restore Activity</Text>
									</TouchableOpacity>
								)}
							</View>
						)}

						{/* Loading and Error states */}
						{loading.visible && (
							<View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 32 }}>
								<MaterialIcons name="hourglass-empty" size={32} color={colors.textSecondary} />
								<Text style={{ padding: 16, color: colors.textSecondary, textAlign: 'center' }}>Loading activities…</Text>
							</View>
						)}
						{error && (
							<Text style={{ padding: 16, color: colors.negative }}>{error}</Text>
						)}

						{/* Unified activity list - deduplicated and sorted */}
						{allActivities.map((item) => {
							if (item.type === 'activity') {
								return (
									<ActivityLogItem 
										key={item.id} 
										event={item.data} 
										themeColors={colors} 
										onPress={(e) => { setSelected(e); setShowDetail(true); }} 
									/>
								);
							} else if (item.type === 'centralized') {
				// Convert centralized activity to ActivityEvent format for ActivityLogItem
				const centralizedEvent = {
					id: item.data.id,
					category: item.data.category,
					type: item.data.type,
					title: item.data.title,
					subtitle: item.data.subtitle,
					description: item.data.description,
					amount: item.data.amount,
					currency: item.data.currency,
					status: item.data.status,
					timestamp: item.data.timestamp,
					cardId: item.data.cardId,
					transactionId: item.data.transactionId,
					tags: item.data.tags,
					userId: item.data.userId,
					source: item.data.source,
					severity: item.data.severity,
					metadata: item.data.metadata,
					// Extract mobile fields from metadata for easier access
					mobileNumber: item.data.metadata?.mobileNumber,
					mobileNetwork: item.data.metadata?.mobileNetwork
				};
								return (
									<ActivityLogItem 
										key={item.id} 
										event={centralizedEvent} 
										themeColors={colors} 
										onPress={(e) => { setSelected(e); setShowDetail(true); }} 
									/>
								);
							} else if (item.type === 'transaction') {
								return (
									<TransactionItem key={item.id} transaction={item.data} />
								);
							} else if (item.type === 'payment') {
								return (
									<View key={item.id} style={[styles.paymentCard, { 
										backgroundColor: colors.card,
										shadowColor: colors.textPrimary,
									}]}>
										<View style={[styles.paymentIconContainer, { backgroundColor: colors.background }]}>
											<CreditCard color={colors.tintPrimary} size={20} />
										</View>
										<View style={styles.paymentDetails}>
											<Text style={[styles.paymentTitle, { color: colors.textPrimary }]}>Payment {item.data.id.slice(-6)}</Text>
											<Text style={[styles.paymentSubtitle, { color: colors.textSecondary }]}>{item.data.status.toUpperCase()} • {item.data.amount ?? '-'} {item.data.currency ?? ''}</Text>
											<Text style={[styles.paymentDate, { color: colors.textSecondary }]}>{item.data.created ? new Date(item.data.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</Text>
										</View>
										<View style={styles.paymentActions}>
											{item.data.status === 'authorized' && (
												<TouchableOpacity onPress={() => handleCapture(item.data.id)} style={[styles.actionButton, { backgroundColor: colors.tintPrimary }]}>
													<Text style={styles.actionButtonText}>Capture</Text>
												</TouchableOpacity>
											)}
											{(item.data.status === 'authorized' || item.data.status === 'captured') && (
												<TouchableOpacity onPress={() => handleRefund(item.data.id)} style={[styles.actionButton, { backgroundColor: colors.negative, marginTop: 4 }]}>
													<Text style={styles.actionButtonText}>Refund</Text>
												</TouchableOpacity>
											)}
										</View>
									</View>
								);
							}
							return null;
						})}

						{/* Load more button */}
						{nextPaymentsCursor && (
							<View style={{ padding: 16, alignItems: 'center' }}>
								<TouchableOpacity disabled={loadingMore} onPress={loadMorePayments} style={{ backgroundColor: colors.tintPrimary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, opacity: loadingMore ? 0.8 : 1 }}>
									<Text style={{ color: '#fff', fontWeight: '700' }}>{loadingMore ? 'Loading…' : 'Load more payments'}</Text>
								</TouchableOpacity>
							</View>
						)}
					</ScrollView>
				</View>

				<DateFilterModal
					visible={showDateFilter}
					onClose={() => setShowDateFilter(false)}
					selectedFilter={dateFilter}
					onFilterSelect={setDateFilter}
				/>

				<ActivityDetailModal 
					visible={showDetail} 
					event={selected} 
					onClose={() => setShowDetail(false)}
					onDelete={async (deletedEvent) => {
						try {
							// Use AppContext's deleteActivity for enhanced deletion with database cleanup
							const result = await deleteActivity(deletedEvent.id);
							
							if (result.success) {
								// Remove from local centralized activities state
								setCentralizedActivities(prev => 
									prev.filter(activity => activity.id !== deletedEvent.id)
								);
								// Refresh the activity list to ensure consistency
								loadCentralizedActivities(false);
								
								showSuccess('Activity Deleted', 'Activity has been deleted successfully.');
							} else {
								showError('Delete Failed', result.error || 'Failed to delete activity.');
							}
						} catch (error) {
							logger.error('ACTIVITY', 'Error deleting activity from modal:', error);
							showError('Delete Failed', 'An unexpected error occurred while deleting the activity.');
						}
					}}
				/>

				<ClearDataModal
					visible={showClearActivity}
					onClose={handleCancelClearActivity}
					onConfirm={handleClearActivity}
					onRestore={handleRestoreActivity}
					dataType="activity"
					count={activity.length + centralizedActivities.length + payments.length}
					isLoading={false}
					useDelayedDeletion={true}
					delayMinutes={2}
				/>
				
				<LoadingAnimation
					visible={loading.visible}
					message={loading.message}
					subtitle={loading.subtitle}
					type={loading.type}
					size={loading.size}
				/>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	keyboardContainer: {
		flex: 1,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 12,
	},
	title: {
		fontSize: 28,
		fontWeight: "bold",
	},
	clearAllText: {
		fontSize: 14,
		fontWeight: "500",
	},
	filterButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	filterTabs: {
		flexDirection: "row",
		paddingHorizontal: 8,
		paddingVertical: 0,
		marginBottom: 0,
	},
	filterScrollContent: {
		paddingRight: 8,
	},
	filterTab: {
		paddingHorizontal: 20,
		paddingVertical: 8,
		borderRadius: 20,
		marginRight: 10,
	},
	filterTabActive: {},
	filterTabText: {
		fontSize: 14,
		fontWeight: "500",
	},
	filterTabTextActive: {},
	categoryChips: {
		flexDirection: "row",
		paddingHorizontal: 16,
		paddingVertical: 8,
		marginBottom: 8,
		gap: 0,
	},
	categoryChip: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 14,
		marginRight: 8,
		borderWidth: 1,
	},
	categoryChipActive: {},
	categoryChipText: {
		fontSize: 12,
		fontWeight: "600",
	},
	categoryChipTextActive: {},
	transactionsContainer: {
		flex: 1,
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		marginTop: 0,
		position: 'relative',
	},
	stickyActivityHeader: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		zIndex: 10,
		// Subtle shadow for gentle visual separation
		shadowColor: "#000",
		shadowOffset: {
			width: 0,
			height: 1.5,
		},
		shadowOpacity: 0.06,
		shadowRadius: 3,
		elevation: 2,
		// Add subtle border at the bottom
		borderBottomWidth: Platform.OS === 'ios' ? 0.5 : 1,
		borderBottomColor: 'rgba(0, 0, 0, 0.04)',
	},
	clearAllContainer: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
		paddingHorizontal: 20,
		marginTop: 12,
		marginBottom: 8,
	},

	transactionsList: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		paddingBottom: 20,
	},
	activityItem: {
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	activityTitle: {
		fontSize: 14,
		fontWeight: "700",
	},
	activitySubtitle: {
		fontSize: 12,
		marginTop: 2,
	},
	activityMeta: {
		fontSize: 11,
		marginTop: 4,
	},
	horizontalBar: {
		height: 2,
		marginHorizontal: 20,
		marginVertical: 8,
		opacity: 0.3,
		zIndex: 1,
	},
	paymentCard: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 16,
		paddingHorizontal: 16,
		marginHorizontal: 16,
		marginVertical: 6,
		borderRadius: 12,
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	paymentIconContainer: {
		width: 44,
		height: 44,
		borderRadius: 22,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	paymentDetails: {
		flex: 1,
	},
	paymentTitle: {
		fontSize: 16,
		fontWeight: '600',
		marginBottom: 4,
	},
	paymentSubtitle: {
		fontSize: 14,
		marginBottom: 4,
	},
	paymentDate: {
		fontSize: 12,
	},
	paymentActions: {
		alignItems: 'flex-end',
	},
	actionButton: {
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: 6,
		minWidth: 70,
		alignItems: 'center',
	},
	actionButtonText: {
		color: '#fff',
		fontSize: 12,
		fontWeight: '600',
	},
});
