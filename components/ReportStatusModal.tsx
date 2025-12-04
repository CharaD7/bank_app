/**
 * Report Status Modal
 * 
 * A beautiful modal component to show report generation success/failure status
 * with options for viewing, saving to device, sharing and better UX than basic alerts.
 * Integrates with storage permissions and file saving functionality.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/context/ThemeContext';
import { withAlpha } from '@/theme/color-utils';
import { fileStorageService } from '../lib/storage/fileStorage.service';
import { storagePermissionsService, StoragePermissionResult } from '../lib/storage/storagePermissions.service';
import { logger } from '../lib/logger';
import StoragePermissionModal from './StoragePermissionModal';

const { width } = Dimensions.get('window');

export interface ReportStatusModalProps {
  visible: boolean;
  onClose: () => void;
  status: 'loading' | 'success' | 'error' | 'idle';
  reportFormat?: 'csv' | 'json' | 'html' | 'pdf';
  fileName?: string;
  reportContent?: string; // The actual report data
  onView?: () => void; // Callback to view report inline
  onShare?: () => void;
  onRetry?: () => void;
  errorMessage?: string;
  loadingMessage?: string;
}

export default function ReportStatusModal({
  visible,
  onClose,
  status,
  reportFormat = 'csv',
  fileName,
  reportContent,
  onView,
  onShare,
  onRetry,
  errorMessage,
  loadingMessage = 'Generating your report...'
}: ReportStatusModalProps) {
  const { colors } = useTheme();
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'close-circle';
      case 'loading':
        return null; // We'll show ActivityIndicator instead
      default:
        return 'document-text';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return '#4CAF50';
      case 'error':
        return '#F44336';
      case 'loading':
        return colors.tintPrimary;
      default:
        return colors.tintPrimary;
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'success':
        return 'Report Generated Successfully! 🎉';
      case 'error':
        return 'Report Generation Failed';
      case 'loading':
        return 'Generating Report';
      default:
        return 'Report Status';
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'success':
        let message = `Your ${reportFormat.toUpperCase()} report has been generated successfully!`;
        if (saveStatus === 'saved') {
          message += '\n\n✅ Report saved to your device.';
        } else if (saveStatus === 'failed') {
          message += '\n\n❌ Failed to save to device, but you can still share or view.';
        }
        if (fileName) {
          message += `\n\nFile: ${fileName}`;
        }
        return message;
      case 'error':
        return errorMessage || 'We encountered an error while generating your report. Please try again.';
      case 'loading':
        return loadingMessage;
      default:
        return 'Preparing your financial report...';
    }
  };

  const handleSaveToDevice = async () => {
    if (!reportContent || !fileName) {
      Alert.alert('Save Error', 'Report content or filename is missing.');
      return;
    }

    try {
      logger.info('REPORT_STATUS_MODAL', 'User attempting to save report to device', {
        fileName,
        format: reportFormat
      });

      // First check if we have storage permissions
      const permissionResult = await storagePermissionsService.checkStoragePermissions();
      
      if (!permissionResult.granted) {
        logger.info('REPORT_STATUS_MODAL', 'Storage permission not granted, showing permission modal');
        setShowPermissionModal(true);
        return;
      }

      // Proceed with saving
      await saveReportFile();
    } catch (error) {
      logger.error('REPORT_STATUS_MODAL', 'Failed to initiate save process', error);
      Alert.alert('Save Error', 'Unable to save report to device. Please try again.');
    }
  };

  const saveReportFile = async () => {
    if (!reportContent || !fileName) return;

    try {
      setIsSaving(true);
      setSaveStatus('saving');
      
      logger.info('REPORT_STATUS_MODAL', 'Saving report file to device', {
        fileName,
        format: reportFormat,
        contentLength: reportContent.length
      });

      const result = await fileStorageService.saveFile({
        content: reportContent,
        fileName,
        mimeType: getFileTypeMimeType(reportFormat),
        description: `Financial report in ${reportFormat.toUpperCase()} format`
      });

      if (result.success) {
        setSaveStatus('saved');
        logger.info('REPORT_STATUS_MODAL', 'Report saved successfully', {
          filePath: result.filePath,
          uri: result.uri
        });
        
        // Show success feedback
        Alert.alert(
          'Report Saved! 📱',
          `Your report has been saved to your device.\n\n${result.filePath || 'Location: Downloads/Documents folder'}`,
          [
            {
              text: 'Great!',
              style: 'default'
            }
          ]
        );
      } else {
        setSaveStatus('failed');
        logger.error('REPORT_STATUS_MODAL', 'Failed to save report file', {
          error: result.error
        });
        
        Alert.alert(
          'Save Failed',
          result.error || 'Unable to save report to device. Please try again or check your device storage.'
        );
      }
    } catch (error) {
      setSaveStatus('failed');
      logger.error('REPORT_STATUS_MODAL', 'Error during save process', error);
      
      Alert.alert(
        'Save Error',
        'An unexpected error occurred while saving. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const getFileTypeMimeType = (format: string): string => {
    switch (format.toLowerCase()) {
      case 'csv':
        return 'text/csv';
      case 'json':
        return 'application/json';
      case 'html':
        return 'text/html';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'text/plain';
    }
  };

  const handlePermissionResult = async (result: StoragePermissionResult) => {
    logger.info('REPORT_STATUS_MODAL', 'Received permission result', {
      granted: result.granted,
      status: result.status
    });

    if (result.granted) {
      // Permission granted, proceed with saving
      setTimeout(async () => {
        await saveReportFile();
      }, 500); // Small delay to allow modal to close smoothly
    } else {
      // Permission denied, inform user
      Alert.alert(
        'Permission Required',
        'Storage permission is needed to save reports to your device. You can still view and share reports without saving.'
      );
    }
  };

  const renderContent = () => {
    return (
      <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
        {/* Status Icon/Indicator */}
        <View style={[styles.statusIconContainer, { backgroundColor: withAlpha(getStatusColor(), 0.1) }]}>
          {status === 'loading' ? (
            <ActivityIndicator size="large" color={getStatusColor()} />
          ) : (
            <Ionicons
              name={getStatusIcon() as any}
              size={64}
              color={getStatusColor()}
            />
          )}
        </View>

        {/* Status Title */}
        <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>
          {getStatusTitle()}
        </Text>

        {/* Status Message */}
        <Text style={[styles.statusMessage, { color: colors.textSecondary }]}>
          {getStatusMessage()}
        </Text>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {status === 'success' && (
            <>
              {/* Primary Actions Row */}
              <View style={styles.primaryActionsRow}>
                {onView && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.tintSoftBg, borderColor: colors.tintPrimary }]}
                    onPress={onView}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="eye" size={18} color={colors.tintPrimary} />
                    <Text style={[styles.actionButtonText, { color: colors.tintPrimary }]}>View</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.actionButton, 
                    { 
                      backgroundColor: isSaving ? colors.textSecondary : colors.tintPrimary, 
                      borderColor: isSaving ? colors.textSecondary : colors.tintPrimary 
                    }
                  ]}
                  onPress={handleSaveToDevice}
                  disabled={isSaving || saveStatus === 'saved'}
                  activeOpacity={0.8}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons 
                      name={saveStatus === 'saved' ? "checkmark" : "download"} 
                      size={18} 
                      color="#FFFFFF" 
                    />
                  )}
                  <Text style={styles.primaryButtonText}>
                    {isSaving ? 'Saving...' : 
                     saveStatus === 'saved' ? 'Saved!' : 
                     'Save to Device'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Secondary Actions Row */}
              <View style={styles.secondaryActionsRow}>
                {onShare && (
                  <LinearGradient
                    colors={[colors.tintPrimary, withAlpha(colors.tintPrimary, 0.8)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.secondaryActionButton, { flex: 1 }]}
                  >
                    <TouchableOpacity
                      style={styles.buttonInner}
                      onPress={onShare}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="share" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>Share Report</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                )}
                
                <TouchableOpacity
                  style={[
                    styles.tertiaryButton, 
                    { 
                      borderColor: colors.border, 
                      backgroundColor: colors.background,
                      flex: onShare ? 1 : 2
                    }
                  ]}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {status === 'error' && (
            <>
              {onRetry && (
                <LinearGradient
                  colors={[colors.tintPrimary, withAlpha(colors.tintPrimary, 0.8)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  <TouchableOpacity
                    style={styles.buttonInner}
                    onPress={onRetry}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Try Again</Text>
                  </TouchableOpacity>
                </LinearGradient>
              )}
              
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {status === 'loading' && (
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
              <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={status !== 'loading' ? onClose : undefined}
      >
        <SafeAreaView style={styles.overlay}>
          <View style={[styles.modalContainer, { backgroundColor: withAlpha('#000000', 0.5) }]}>
            <TouchableOpacity
              style={styles.backdropTouchable}
              activeOpacity={1}
              onPress={status !== 'loading' ? onClose : undefined}
            >
              <View style={styles.modalWrapper} onStartShouldSetResponder={() => true}>
                {renderContent()}
              </View>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Storage Permission Modal */}
      <StoragePermissionModal
        visible={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onPermissionResult={handlePermissionResult}
        fileName={fileName}
        fileType={reportFormat}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalContent: {
    width: width * 0.85,
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  statusIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 28,
  },
  statusMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  actionContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  // New styles for enhanced layout
  primaryActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryActionButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tertiaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
});
