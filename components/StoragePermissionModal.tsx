/**
 * Storage Permission Modal Component
 * 
 * Explains why storage access is needed and guides users through granting permissions
 * Provides user-friendly interface for permission requests with clear explanations
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { storagePermissionsService, StoragePermissionResult } from '../lib/storage/storagePermissions.service';
import { logger } from '../lib/logger';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface StoragePermissionModalProps {
  visible: boolean;
  onClose: () => void;
  onPermissionResult: (result: StoragePermissionResult) => void;
  fileName?: string;
  fileType?: 'csv' | 'json' | 'html' | 'pdf';
  showRationale?: boolean;
}

const StoragePermissionModal: React.FC<StoragePermissionModalProps> = ({
  visible,
  onClose,
  onPermissionResult,
  fileName = 'financial-report',
  fileType = 'pdf',
  showRationale = false
}) => {
  const { colors, isDarkMode } = useTheme();
  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<StoragePermissionResult | null>(null);
  const [shouldShowRationale, setShouldShowRationale] = useState(false);

  useEffect(() => {
    if (visible) {
      checkInitialPermissionStatus();
    }
  }, [visible]);

  const checkInitialPermissionStatus = async () => {
    try {
      logger.info('STORAGE_PERMISSION_MODAL', 'Checking initial permission status');
      
      const result = await storagePermissionsService.checkStoragePermissions();
      setPermissionStatus(result);
      
      // Check if we should show rationale on Android
      if (Platform.OS === 'android') {
        const shouldShow = await storagePermissionsService.shouldShowPermissionRationale();
        setShouldShowRationale(shouldShow);
      }
      
      logger.info('STORAGE_PERMISSION_MODAL', 'Initial permission check complete', {
        granted: result.granted,
        status: result.status,
        shouldShowRationale: shouldShowRationale
      });
    } catch (error) {
      logger.error('STORAGE_PERMISSION_MODAL', 'Failed to check initial permissions', error);
    }
  };

  const handleRequestPermissions = async () => {
    try {
      setIsRequesting(true);
      logger.info('STORAGE_PERMISSION_MODAL', 'User requesting storage permissions');

      const result = await storagePermissionsService.requestStoragePermissions({
        title: 'Save Financial Report',
        message: `This app needs access to your device storage to save "${fileName}.${fileType}" to your device.\n\nThis allows you to:\n• Keep reports for your records\n• Access files offline\n• Share reports with other apps`,
        positiveButton: 'Allow',
        negativeButton: 'Not Now'
      });

      setPermissionStatus(result);
      
      logger.info('STORAGE_PERMISSION_MODAL', 'Permission request completed', {
        granted: result.granted,
        status: result.status
      });

      // Notify parent component of result
      onPermissionResult(result);

      // Handle different permission states
      if (result.granted) {
        // Permission granted - close modal and let parent handle next steps
        setTimeout(() => {
          onClose();
        }, 1000);
      } else if (result.status === 'never_ask_again') {
        // Show settings dialog after a brief delay
        setTimeout(async () => {
          await storagePermissionsService.showPermissionSettingsDialog();
        }, 1500);
      }
    } catch (error) {
      logger.error('STORAGE_PERMISSION_MODAL', 'Permission request failed', error);
      Alert.alert(
        'Permission Error', 
        'Unable to request storage permissions. Please try again or enable manually in settings.'
      );
    } finally {
      setIsRequesting(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      logger.info('STORAGE_PERMISSION_MODAL', 'User requesting to open settings');
      await storagePermissionsService.showPermissionSettingsDialog();
    } catch (error) {
      logger.error('STORAGE_PERMISSION_MODAL', 'Failed to open settings', error);
    }
  };

  const handleDismiss = () => {
    logger.info('STORAGE_PERMISSION_MODAL', 'User dismissed permission modal');
    
    // If permission was denied, still notify parent with the current status
    if (permissionStatus && !permissionStatus.granted) {
      onPermissionResult(permissionStatus);
    }
    
    onClose();
  };

  const getPermissionExplanation = () => {
    if (Platform.OS === 'android') {
      const androidVersion = Platform.Version as number;
      if (androidVersion >= 33) {
        return 'Android 13+ requires permission to save files to your device storage. This ensures your financial reports are securely saved where you can access them.';
      } else {
        return 'Storage permission is needed to save financial reports to your device. Your files will be saved securely to your chosen location.';
      }
    } else {
      return 'Files will be saved to your app documents, accessible through the iOS Files app.';
    }
  };

  const getBenefitsText = () => [
    'Keep financial reports for your records',
    'Access reports offline anytime',
    'Share files with other apps easily',
    'Backup important financial data',
    'Control where your files are saved'
  ];

  const getStatusIcon = () => {
    if (!permissionStatus) return 'help-circle-outline';
    
    switch (permissionStatus.status) {
      case 'granted':
        return 'checkmark-circle';
      case 'denied':
        return 'close-circle-outline';
      case 'never_ask_again':
        return 'settings-outline';
      default:
        return 'alert-circle-outline';
    }
  };

  const getStatusColor = () => {
    if (!permissionStatus) return colors.textSecondary;
    
    switch (permissionStatus.status) {
      case 'granted':
        return colors.positive;
      case 'denied':
        return colors.warning;
      case 'never_ask_again':
        return colors.negative;
      default:
        return colors.textSecondary;
    }
  };

  const renderPermissionStatus = () => {
    if (!permissionStatus) return null;

    return (
      <View style={[
        styles.statusContainer,
        { backgroundColor: colors.background, borderColor: getStatusColor() }
      ]}>
        <Ionicons 
          name={getStatusIcon() as any} 
          size={24} 
          color={getStatusColor()} 
          style={styles.statusIcon}
        />
        <View style={styles.statusTextContainer}>
          <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>
            {permissionStatus.status === 'granted' ? 'Permission Granted' :
             permissionStatus.status === 'denied' ? 'Permission Denied' :
             permissionStatus.status === 'never_ask_again' ? 'Permission Blocked' :
             'Permission Required'}
          </Text>
          <Text style={[styles.statusMessage, { color: colors.textSecondary }]}>
            {permissionStatus.message}
          </Text>
        </View>
      </View>
    );
  };

  const renderActionButtons = () => {
    if (permissionStatus?.granted) {
      return (
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.positive }]}
          onPress={handleDismiss}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>
      );
    }

    if (permissionStatus?.status === 'never_ask_again') {
      return (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={handleDismiss}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.tintPrimary }]}
            onPress={handleOpenSettings}
            activeOpacity={0.8}
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={handleDismiss}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Not Now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton, 
            { backgroundColor: isRequesting ? colors.textSecondary : colors.tintPrimary }
          ]}
          onPress={handleRequestPermissions}
          disabled={isRequesting}
          activeOpacity={0.8}
        >
          {isRequesting ? (
            <>
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Requesting...</Text>
            </>
          ) : (
            <>
              <Ionicons name="folder-open-outline" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Allow Storage</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity 
            onPress={handleDismiss}
            style={[styles.closeButton, { backgroundColor: colors.card }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Save Report to Device
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {fileName}.{fileType}
            </Text>
          </View>
          
          <View style={styles.closeButton} />
        </View>

        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Icon and main explanation */}
          <View style={styles.mainSection}>
            <View style={[styles.iconContainer, { backgroundColor: colors.tintSoftBg }]}>
              <Ionicons name="save-outline" size={48} color={colors.tintPrimary} />
            </View>
            
            <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>
              Storage Access Required
            </Text>
            
            <Text style={[styles.mainDescription, { color: colors.textSecondary }]}>
              {getPermissionExplanation()}
            </Text>
          </View>

          {/* Permission status */}
          {renderPermissionStatus()}

          {/* Benefits */}
          <View style={styles.benefitsSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              📊 Why This Helps You:
            </Text>
            
            {getBenefitsText().map((benefit, index) => (
              <View key={index} style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
                <Text style={[styles.benefitText, { color: colors.textSecondary }]}>
                  {benefit}
                </Text>
              </View>
            ))}
          </View>

          {/* Privacy note */}
          <View style={[styles.privacySection, { backgroundColor: colors.card }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.positive} style={styles.privacyIcon} />
            <View style={styles.privacyTextContainer}>
              <Text style={[styles.privacyTitle, { color: colors.textPrimary }]}>
                Your Privacy is Protected
              </Text>
              <Text style={[styles.privacyDescription, { color: colors.textSecondary }]}>
                We only access storage to save files you explicitly request. No data is collected or shared.
              </Text>
            </View>
          </View>

          {/* Platform-specific note */}
          <View style={styles.platformNote}>
            <Text style={[styles.platformNoteText, { color: colors.textSecondary }]}>
              {Platform.OS === 'android' 
                ? 'Files will be saved to your Downloads or Documents folder' 
                : 'Files will be saved to your app documents folder, accessible via Files app'}
            </Text>
          </View>
        </ScrollView>

        {/* Action buttons */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {renderActionButtons()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '400',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  mainSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  mainDescription: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginVertical: 20,
  },
  statusIcon: {
    marginRight: 12,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  benefitsSection: {
    marginTop: 20,
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  benefitText: {
    fontSize: 15,
    lineHeight: 22,
    marginLeft: 10,
    flex: 1,
  },
  privacySection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  privacyIcon: {
    marginTop: 2,
    marginRight: 12,
  },
  privacyTextContainer: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  privacyDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  platformNote: {
    alignItems: 'center',
    marginTop: 10,
  },
  platformNoteText: {
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default StoragePermissionModal;