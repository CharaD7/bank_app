# Activity Screen Filter System Documentation

## Overview

The Activity screen features a comprehensive filtering system that allows users to filter activities by category and status. The system includes horizontal scrollable filter buttons, state persistence, haptic feedback, and performance optimizations.

## Filter Types

### Category Filters
Located in the first horizontal scroll row, these filters organize activities by type:

- **All**: Shows all activities (resets all category filters to active)
- **Income**: Shows transactions with positive amounts and incoming transfers
- **Expense**: Shows transactions with negative amounts and outgoing payments
- **Account**: Shows account-related activities (updates, changes, etc.)
- **Cards**: Shows card-related activities (issuance, activation, etc.)

### Status Filters
Located in the second horizontal scroll row, these filters organize activities by completion status:

- **Completed**: Shows successfully completed activities (mapped to 'captured' for payments)
- **Pending**: Shows activities in progress (mapped to 'authorized' for payments)
- **Failed**: Shows failed activities and transactions
- **Refunded**: Shows reversed/refunded activities (mapped to 'refunded' for payments)
- **Info**: Shows informational activities without specific status
- **All Status**: Resets all status filters to active

## Technical Implementation

### State Management
Filters are managed through React state with the following structure:

```typescript
// Category filters
const [filters, setFilters] = useState({ 
  income: true, 
  expense: true, 
  account: true, 
  card: true 
});

// Status filters
const [statusFilter, setStatusFilter] = useState({ 
  completed: true, 
  pending: true, 
  failed: true, 
  reversed: true, 
  info: true 
});
```

### Filter Logic
The unified filtering system processes activities through a multi-step filter:

1. **Date Filter**: Applied first based on selected date range
2. **Category Filter**: Filters by activity type/category
3. **Status Filter**: Filters by completion status
4. **Deduplication**: Removes duplicate activities from multiple sources

### Data Sources
The filter system processes activities from multiple sources:

- **Centralized Activities**: From `activityLogger` service (highest priority)
- **Legacy Activity Cards**: From context activity array
- **Transactions**: From context transactions array
- **Payments**: From payments API

### Persistence
Filter preferences are automatically saved to AsyncStorage with the following keys:

- `activityFilters`: Category filter preferences
- `txTypeFilter`: Transaction type filter preferences (legacy)
- `txStatusFilter`: Status filter preferences

Persistence features:
- **Debounced Saves**: 500ms delay to prevent excessive AsyncStorage writes
- **Error Handling**: Graceful handling of storage errors with logging
- **Validation**: Data validation on load to prevent corrupt states
- **Auto-restore**: Filters restored on app launch

## User Experience Features

### Haptic Feedback
- **Light Impact**: On successful filter toggle
- **Medium Impact**: On "All" button press
- **Warning Notification**: When attempting to disable all filters

### Visual Feedback
- **Color-coded States**: Selected filters have distinct visual treatment
- **Smooth Transitions**: Animated state changes
- **Accessibility**: Proper accessibility labels and roles

### Performance Optimizations
- **Memoized Components**: Filter buttons use `React.memo` to prevent unnecessary re-renders
- **Debounced Operations**: AsyncStorage writes are debounced for performance
- **Optimized Scrolling**: ScrollViews configured for smooth horizontal scrolling
- **Efficient Filtering**: Uses `useMemo` for filter calculations

## Filter Rules and Constraints

### Category Filter Rules
1. At least one category filter must remain active
2. Attempting to disable all categories shows warning and maintains current state
3. "All" button activates all category filters

### Status Filter Rules
1. At least one status filter must remain active  
2. Attempting to disable all status filters shows warning and maintains current state
3. "All Status" button activates all status filters

### Status Mapping
Payment statuses are mapped to activity screen statuses:
- `captured` → `completed`
- `authorized` → `pending`
- `failed` → `failed`
- `refunded` → `reversed`
- Missing status → `info`

## Component Architecture

### FilterButton Component
```typescript
const FilterButton = memo(({ 
  filterKey, 
  isSelected, 
  label, 
  icon, 
  tone, 
  onToggle,
  colors 
}: FilterButtonProps) => {
  // Memoized component for performance
  // Handles accessibility and visual states
});
```

### Hook Integration
The filter system integrates with several hooks:
- `useCallback`: For memoized toggle functions
- `useMemo`: For filtered data calculations
- `useEffect`: For persistence and lifecycle management
- `useRef`: For debounced timeout management

## Testing

### Unit Tests
- Filter state management logic
- AsyncStorage operations
- Date filtering functions
- Filter combination logic
- Error handling scenarios

### Integration Tests
- Component rendering and interaction
- Accessibility compliance
- Haptic feedback integration
- State persistence across app lifecycle

### Test Coverage
- Filter toggle behavior
- Edge cases (all filters disabled)
- Storage error handling
- Performance under load
- Accessibility features

## Accessibility Features

### Screen Reader Support
- Proper accessibility labels for all filter buttons
- Role definitions for interactive elements
- State announcements (selected/not selected)

### Touch Targets
- Minimum 44pt touch targets for all buttons
- Appropriate spacing between filter chips
- Comfortable scrolling areas

### Visual Accessibility
- High contrast color schemes
- Clear selected/unselected states
- Consistent visual hierarchy

## Troubleshooting

### Common Issues

1. **Filters not persisting**: Check AsyncStorage permissions and error logs
2. **Performance issues**: Verify memoization is working and reduce filter complexity
3. **Visual glitches**: Check theme integration and color calculations

### Debug Information
Enable debug logging to see filter operations:
```javascript
logger.debug('ACTIVITY', 'Filter state change', { filters, statusFilter });
```

### Performance Monitoring
Monitor filter performance through:
- React DevTools Profiler
- Filter calculation timing logs
- AsyncStorage operation logs

## Migration Notes

### From Previous Filter System
- Legacy separate filtering has been unified into single system
- All filters now work on unified activity list
- Performance improvements through memoization
- Enhanced accessibility and haptic feedback

### Breaking Changes
- Filter logic now applies to all activity types uniformly
- AsyncStorage keys may have changed
- Component props may be different for custom filter buttons

## Future Enhancements

### Planned Features
1. Custom date range picker
2. Advanced filter combinations
3. Saved filter presets
4. Export filtered results

### Performance Improvements
1. Virtual scrolling for large datasets
2. Background filter processing
3. Predictive filtering
4. Caching optimizations