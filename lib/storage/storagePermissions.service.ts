/**
 * Storage Permissions Service
 * 
 * Handles device storage permission requests for saving reports and files
 * Provides cross-platform support for Android and iOS storage access
 */

import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import { logger } from '../logger';

export interface StoragePermissionResult {
  granted: boolean;
  status: 'granted' | 'denied' | 'never_ask_again' | 'unavailable';
  message: string;
}

export interface StoragePermissionOptions {
  showRationale?: boolean;
  title?: string;
  message?: string;
  positiveButton?: string;
  negativeButton?: string;
}

/**
 * Storage Permissions Service Class
 */
export class StoragePermissionsService {
  private hasCheckedInitialPermissions = false;

  constructor() {
    logger.info('STORAGE_PERMISSIONS', 'Storage permissions service initialized');
  }

  /**
   * Check if storage permissions are granted
   */
  async checkStoragePermissions(): Promise<StoragePermissionResult> {
    try {
      logger.info('STORAGE_PERMISSIONS', 'Checking storage permissions', { platform: Platform.OS });

      if (Platform.OS === 'android') {
        return await this.checkAndroidStoragePermissions();
      } else if (Platform.OS === 'ios') {
        return await this.checkiOSStoragePermissions();
      } else {
        logger.warn('STORAGE_PERMISSIONS', 'Unsupported platform', { platform: Platform.OS });
        return {
          granted: false,
          status: 'unavailable',
          message: 'Storage permissions not available on this platform'
        };
      }
    } catch (error) {
      logger.error('STORAGE_PERMISSIONS', 'Failed to check storage permissions', error);
      return {
        granted: false,
        status: 'unavailable',
        message: 'Failed to check storage permissions'
      };
    }
  }

  /**
   * Request storage permissions from user
   */
  async requestStoragePermissions(options: StoragePermissionOptions = {}): Promise<StoragePermissionResult> {
    try {
      logger.info('STORAGE_PERMISSIONS', 'Requesting storage permissions', { 
        platform: Platform.OS,
        options 
      });

      // First check current permissions
      const currentPermissions = await this.checkStoragePermissions();
      if (currentPermissions.granted) {
        logger.info('STORAGE_PERMISSIONS', 'Storage permissions already granted');
        return currentPermissions;
      }

      if (Platform.OS === 'android') {
        return await this.requestAndroidStoragePermissions(options);
      } else if (Platform.OS === 'ios') {
        return await this.requestiOSStoragePermissions(options);
      } else {
        return {
          granted: false,
          status: 'unavailable',
          message: 'Storage permissions not available on this platform'
        };
      }
    } catch (error) {
      logger.error('STORAGE_PERMISSIONS', 'Failed to request storage permissions', error);
      return {
        granted: false,
        status: 'unavailable',
        message: 'Failed to request storage permissions'
      };
    }
  }

  /**
   * Check Android storage permissions
   */
  private async checkAndroidStoragePermissions(): Promise<StoragePermissionResult> {
    try {
      const androidVersion = Platform.Version as number;
      
      // Android 13+ (API 33+) uses more specific permissions
      if (androidVersion >= 33) {
        // Check for scoped storage permissions (Android 13+)
        const readImages = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
        const readVideo = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO);
        const readAudio = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO);
        
        const hasMediaPermissions = readImages || readVideo || readAudio;
        
        logger.info('STORAGE_PERMISSIONS', 'Android 13+ permissions check', {
          readImages,
          readVideo,
          readAudio,
          hasMediaPermissions,
          androidVersion
        });

        return {
          granted: hasMediaPermissions,
          status: hasMediaPermissions ? 'granted' : 'denied',
          message: hasMediaPermissions 
            ? 'Storage permissions granted'
            : 'Storage permissions required to save reports'
        };
      } else if (androidVersion >= 30) {
        // Android 11-12 (API 30-32) - Scoped storage with legacy support
        const writeStorage = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        const readStorage = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        
        logger.info('STORAGE_PERMISSIONS', 'Android 11-12 permissions check', {
          writeStorage,
          readStorage,
          androidVersion
        });

        return {
          granted: writeStorage && readStorage,
          status: (writeStorage && readStorage) ? 'granted' : 'denied',
          message: (writeStorage && readStorage)
            ? 'Storage permissions granted'
            : 'Storage permissions required to save reports'
        };
      } else {
        // Android 10 and below - Traditional storage permissions
        const writeStorage = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        const readStorage = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        
        logger.info('STORAGE_PERMISSIONS', 'Android 10- permissions check', {
          writeStorage,
          readStorage,
          androidVersion
        });

        return {
          granted: writeStorage && readStorage,
          status: (writeStorage && readStorage) ? 'granted' : 'denied',
          message: (writeStorage && readStorage)
            ? 'Storage permissions granted'
            : 'Storage permissions required to save reports'
        };
      }
    } catch (error) {
      logger.error('STORAGE_PERMISSIONS', 'Android storage permissions check failed', error);
      return {
        granted: false,
        status: 'unavailable',
        message: 'Unable to check storage permissions'
      };
    }
  }

  /**
   * Request Android storage permissions
   */
  private async requestAndroidStoragePermissions(options: StoragePermissionOptions): Promise<StoragePermissionResult> {
    try {
      const androidVersion = Platform.Version as number;
      
      logger.info('STORAGE_PERMISSIONS', 'Requesting Android storage permissions', { 
        androidVersion,
        options 
      });

      let permissionsToRequest: string[] = [];
      
      // Determine which permissions to request based on Android version
      if (androidVersion >= 33) {
        // Android 13+ - Request media permissions
        permissionsToRequest = [
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
        ];
      } else {
        // Android 12 and below - Request traditional storage permissions
        permissionsToRequest = [
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ];
      }

      // Request permissions
      const granted = await PermissionsAndroid.requestMultiple(
        permissionsToRequest,
        {
          title: options.title || 'Storage Permission Required',
          message: options.message || 'This app needs access to your device storage to save financial reports securely.',
          buttonPositive: options.positiveButton || 'Grant Access',
          buttonNegative: options.negativeButton || 'Not Now',
        }
      );

      // Check if any permission was granted
      const grantedPermissions = Object.values(granted);
      const hasAnyPermission = grantedPermissions.some(permission => permission === PermissionsAndroid.RESULTS.GRANTED);
      const hasNeverAskAgain = grantedPermissions.some(permission => permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);

      logger.info('STORAGE_PERMISSIONS', 'Android permission request result', {
        granted,
        hasAnyPermission,
        hasNeverAskAgain
      });

      let status: StoragePermissionResult['status'] = 'denied';
      let message = 'Storage access denied. You can still share reports via other apps.';

      if (hasAnyPermission) {
        status = 'granted';
        message = 'Storage access granted. You can now save reports to your device.';
      } else if (hasNeverAskAgain) {
        status = 'never_ask_again';
        message = 'Storage access permanently denied. You can enable it in app settings if needed.';
      }

      return {
        granted: hasAnyPermission,
        status,
        message
      };

    } catch (error) {
      logger.error('STORAGE_PERMISSIONS', 'Android storage permissions request failed', error);
      return {
        granted: false,
        status: 'unavailable',
        message: 'Failed to request storage permissions'
      };
    }
  }

  /**
   * Check iOS storage permissions (iOS doesn't need explicit storage permissions for app documents)
   */
  private async checkiOSStoragePermissions(): Promise<StoragePermissionResult> {
    // iOS doesn't require explicit storage permissions for app documents directory
    // Files saved to app documents are automatically accessible
    logger.info('STORAGE_PERMISSIONS', 'iOS storage check - permissions not required for app documents');
    
    return {
      granted: true,
      status: 'granted',
      message: 'Storage access available for app documents'
    };
  }

  /**
   * Request iOS storage permissions (handled automatically by system)
   */
  private async requestiOSStoragePermissions(options: StoragePermissionOptions): Promise<StoragePermissionResult> {
    // iOS handles storage permissions automatically for app sandbox
    logger.info('STORAGE_PERMISSIONS', 'iOS storage permissions handled by system');
    
    return {
      granted: true,
      status: 'granted',
      message: 'Storage access granted for app documents'
    };
  }

  /**
   * Show settings dialog for permanently denied permissions
   */
  async showPermissionSettingsDialog(): Promise<void> {
    return new Promise((resolve) => {
      Alert.alert(
        'Storage Permission Required',
        'Storage access is required to save reports to your device. You can enable this permission in your device settings.\n\nWould you like to open settings now?',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => {
              logger.info('STORAGE_PERMISSIONS', 'User declined to open settings');
              resolve();
            },
          },
          {
            text: 'Open Settings',
            onPress: async () => {
              try {
                logger.info('STORAGE_PERMISSIONS', 'Opening device settings');
                await Linking.openSettings();
                resolve();
              } catch (error) {
                logger.error('STORAGE_PERMISSIONS', 'Failed to open settings', error);
                Alert.alert('Error', 'Unable to open settings. Please manually enable storage permissions in your device settings.');
                resolve();
              }
            },
          },
        ]
      );
    });
  }

  /**
   * Get user-friendly permission status message
   */
  getPermissionStatusMessage(result: StoragePermissionResult): string {
    switch (result.status) {
      case 'granted':
        return 'Storage access granted. You can save reports to your device.';
      case 'denied':
        return 'Storage access denied. You can still view and share reports.';
      case 'never_ask_again':
        return 'Storage access permanently denied. Enable in settings to save reports locally.';
      case 'unavailable':
        return 'Storage access not available on this device.';
      default:
        return 'Unknown permission status.';
    }
  }

  /**
   * Check if we should show permission rationale
   */
  async shouldShowPermissionRationale(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      const androidVersion = Platform.Version as number;
      
      if (androidVersion >= 33) {
        const shouldShowRationale = await PermissionsAndroid.shouldShowRequestPermissionRationale(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        );
        return shouldShowRationale;
      } else {
        const shouldShowRationale = await PermissionsAndroid.shouldShowRequestPermissionRationale(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
        return shouldShowRationale;
      }
    } catch (error) {
      logger.error('STORAGE_PERMISSIONS', 'Failed to check rationale', error);
      return false;
    }
  }
}

// Export singleton instance
export const storagePermissionsService = new StoragePermissionsService();

// Export types and service
export default storagePermissionsService;