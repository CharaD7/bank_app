/**
 * File Storage Service
 * 
 * Handles saving generated reports to device storage with proper file management
 * Provides cross-platform support for different storage locations and file types
 */

import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { logger } from '../logger';
import { storagePermissionsService, StoragePermissionResult } from './storagePermissions.service';

export interface SaveFileOptions {
  content: string;
  fileName: string;
  fileType: 'csv' | 'json' | 'html' | 'pdf';
  location?: 'downloads' | 'documents' | 'cache' | 'temp';
  mimeType?: string;
  requestPermissions?: boolean;
  showSuccessMessage?: boolean;
}

export interface SaveFileResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
  permissionResult?: StoragePermissionResult;
}

export interface StorageLocation {
  path: string;
  name: string;
  description: string;
  requiresPermission: boolean;
}

/**
 * File Storage Service Class
 */
export class FileStorageService {
  private readonly fileExtensions = {
    csv: '.csv',
    json: '.json',
    html: '.html',
    pdf: '.pdf'
  };

  private readonly mimeTypes = {
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
    pdf: 'application/pdf'
  };

  constructor() {
    logger.info('FILE_STORAGE', 'File storage service initialized');
  }

  /**
   * Get available storage locations
   */
  async getAvailableStorageLocations(): Promise<StorageLocation[]> {
    const locations: StorageLocation[] = [];

    try {
      // App documents directory (always available)
      locations.push({
        path: FileSystem.documentDirectory || '',
        name: 'App Documents',
        description: 'Saved to app private storage',
        requiresPermission: false
      });

      // Cache directory (temporary storage)
      locations.push({
        path: FileSystem.cacheDirectory || '',
        name: 'Temporary Storage',
        description: 'Temporary files (may be cleared)',
        requiresPermission: false
      });

      // Add shareable app storage location
      locations.push({
        path: FileSystem.documentDirectory || '',
        name: 'Save & Share',
        description: 'Save to app storage and share to any app (Downloads, Drive, etc.)',
        requiresPermission: false
      });
      
      // Platform-specific additional options
      if (Platform.OS === 'ios') {
        // iOS Files app integration (documents can be accessed via Files app)
        locations.push({
          path: FileSystem.documentDirectory || '',
          name: 'Files App',
          description: 'Accessible via iOS Files app',
          requiresPermission: false
        });
      }

      logger.info('FILE_STORAGE', 'Available storage locations', { 
        count: locations.length,
        locations: locations.map(l => ({ name: l.name, requiresPermission: l.requiresPermission }))
      });

      return locations;
    } catch (error) {
      logger.error('FILE_STORAGE', 'Failed to get storage locations', error);
      return [{
        path: FileSystem.documentDirectory || '',
        name: 'App Documents',
        description: 'Default app storage',
        requiresPermission: false
      }];
    }
  }

  /**
   * Save file to device storage
   */
  async saveFileToDevice(options: SaveFileOptions): Promise<SaveFileResult> {
    try {
      logger.info('FILE_STORAGE', 'Starting file save operation', {
        fileName: options.fileName,
        fileType: options.fileType,
        location: options.location,
        contentLength: options.content.length
      });

      // Check if permissions are needed
      if (options.requestPermissions !== false && this.locationRequiresPermission(options.location)) {
        logger.info('FILE_STORAGE', 'Checking storage permissions');
        const permissionResult = await storagePermissionsService.requestStoragePermissions({
          title: 'Save Report to Device',
          message: 'Allow access to device storage to save your financial report locally.',
          positiveButton: 'Allow',
          negativeButton: 'Cancel'
        });

        if (!permissionResult.granted) {
          logger.warn('FILE_STORAGE', 'Storage permissions not granted', permissionResult);
          return {
            success: false,
            error: 'Storage permission required to save file',
            permissionResult
          };
        }
      }

      // Generate file name with extension
      const fileExtension = this.fileExtensions[options.fileType];
      const fileName = options.fileName.endsWith(fileExtension) 
        ? options.fileName 
        : `${options.fileName}${fileExtension}`;

      // Determine save location
      const savePath = await this.determineSavePath(options.location, fileName);
      
      logger.info('FILE_STORAGE', 'Determined save path', { savePath, fileName });

      // Save file based on platform and location
      const result = await this.performFileSave(savePath, options.content, options);

      if (result.success) {
        logger.info('FILE_STORAGE', 'File saved successfully', {
          filePath: result.filePath,
          fileName: result.fileName,
          fileSize: result.fileSize
        });

        // Show success message if requested
        if (options.showSuccessMessage) {
          // This could trigger a toast or notification
          logger.info('FILE_STORAGE', 'File save success message shown');
        }
      }

      return result;
    } catch (error) {
      logger.error('FILE_STORAGE', 'File save operation failed', error);
      return {
        success: false,
        error: `Failed to save file: ${error.message || 'Unknown error'}`
      };
    }
  }

  /**
   * Share file using device sharing functionality
   */
  async shareFile(filePath: string, mimeType?: string): Promise<boolean> {
    try {
      logger.info('FILE_STORAGE', 'Starting file share', { filePath, mimeType });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: mimeType || 'application/octet-stream',
          dialogTitle: 'Share Financial Report',
          UTI: mimeType || 'public.data'
        });

        logger.info('FILE_STORAGE', 'File shared successfully');
        return true;
      } else {
        logger.warn('FILE_STORAGE', 'Sharing not available on this device');
        return false;
      }
    } catch (error) {
      logger.error('FILE_STORAGE', 'File sharing failed', error);
      return false;
    }
  }

  /**
   * Open file with default app (if possible)
   */
  async openFile(filePath: string): Promise<boolean> {
    try {
      logger.info('FILE_STORAGE', 'Attempting to open file', { filePath });

      // On most platforms, we can use the sharing functionality to open files
      return await this.shareFile(filePath);
    } catch (error) {
      logger.error('FILE_STORAGE', 'Failed to open file', error);
      return false;
    }
  }

  /**
   * Get file information
   */
  async getFileInfo(filePath: string): Promise<{ exists: boolean; size?: number; lastModified?: Date }> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      
      if (fileInfo.exists) {
        return {
          exists: true,
          size: fileInfo.size,
          lastModified: fileInfo.modificationTime ? new Date(fileInfo.modificationTime) : undefined
        };
      } else {
        return { exists: false };
      }
    } catch (error) {
      logger.error('FILE_STORAGE', 'Failed to get file info', error);
      return { exists: false };
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      logger.info('FILE_STORAGE', 'Deleting file', { filePath });
      
      await FileSystem.deleteAsync(filePath, { idempotent: true });
      
      logger.info('FILE_STORAGE', 'File deleted successfully');
      return true;
    } catch (error) {
      logger.error('FILE_STORAGE', 'Failed to delete file', error);
      return false;
    }
  }

  /**
   * List files in directory
   */
  async listFiles(directory: string): Promise<string[]> {
    try {
      const files = await FileSystem.readDirectoryAsync(directory);
      logger.info('FILE_STORAGE', 'Directory listing', { directory, fileCount: files.length });
      return files;
    } catch (error) {
      logger.error('FILE_STORAGE', 'Failed to list files', error);
      return [];
    }
  }

  /**
   * Get MIME type for file type
   */
  getMimeType(fileType: SaveFileOptions['fileType']): string {
    return this.mimeTypes[fileType] || 'application/octet-stream';
  }

  /**
   * Check if location requires permissions
   */
  private locationRequiresPermission(location?: SaveFileOptions['location']): boolean {
    // Since we're using app storage + sharing, no external storage permissions needed
    return false;
  }

  /**
   * Determine the actual save path based on location preference
   */
  private async determineSavePath(location: SaveFileOptions['location'], fileName: string): Promise<string> {
    try {
      switch (location) {
        case 'downloads':
          // Save to app documents since we'll use sharing for Downloads access
          // This approach works better with Expo managed workflow
          logger.info('FILE_STORAGE', 'Saving to app documents for Downloads location (will use share dialog)');
          return `${FileSystem.documentDirectory}${fileName}`;
          
        case 'documents':
          // Save to app documents directory
          return `${FileSystem.documentDirectory}${fileName}`;

        case 'cache':
          return `${FileSystem.cacheDirectory}${fileName}`;

        case 'temp':
          return `${FileSystem.cacheDirectory}${fileName}`;

        default:
          // Default to app documents directory
          logger.info('FILE_STORAGE', 'Using default app documents directory');
          return `${FileSystem.documentDirectory}${fileName}`;
      }
    } catch (error) {
      logger.error('FILE_STORAGE', 'Failed to determine save path, using fallback', error);
      return `${FileSystem.documentDirectory}${fileName}`;
    }
  }

  /**
   * Perform the actual file save operation
   */
  private async performFileSave(filePath: string, content: string, options: SaveFileOptions): Promise<SaveFileResult> {
    try {
      const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
      
      // Use Expo FileSystem for all file operations
      const directory = filePath.substring(0, filePath.lastIndexOf('/'));
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

      // Write file
      await FileSystem.writeAsStringAsync(filePath, content, {
        encoding: FileSystem.EncodingType.UTF8
      });

      // Get file info for result
      const fileInfo = await this.getFileInfo(filePath);
      
      logger.info('FILE_STORAGE', 'File written successfully', {
        filePath,
        fileName,
        size: fileInfo.size
      });

      return {
        success: true,
        filePath,
        fileName,
        fileSize: fileInfo.size
      };
    } catch (error) {
      logger.error('FILE_STORAGE', 'File write operation failed', error);
      
      // Try fallback to app documents if the original location failed
      if (!filePath.includes(FileSystem.documentDirectory || '')) {
        logger.info('FILE_STORAGE', 'Attempting fallback to app documents directory');
        const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
        const fallbackPath = `${FileSystem.documentDirectory}${fileName}`;
        
        try {
          await FileSystem.writeAsStringAsync(fallbackPath, content, {
            encoding: FileSystem.EncodingType.UTF8
          });

          const fileInfo = await this.getFileInfo(fallbackPath);
          
          logger.info('FILE_STORAGE', 'Fallback save successful', {
            filePath: fallbackPath,
            fileName,
            size: fileInfo.size
          });

          return {
            success: true,
            filePath: fallbackPath,
            fileName,
            fileSize: fileInfo.size
          };
        } catch (fallbackError) {
          logger.error('FILE_STORAGE', 'Fallback save also failed', fallbackError);
        }
      }

      return {
        success: false,
        error: `Failed to write file: ${error.message}`
      };
    }
  }

  /**
   * Generate a unique filename to avoid conflicts
   */
  generateUniqueFileName(baseName: string, extension: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${baseName}-${timestamp}-${randomSuffix}${extension}`;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  }
}

// Export singleton instance
export const fileStorageService = new FileStorageService();

// Export types and service
export default fileStorageService;