/**
 * Report Preview Modal
 * 
 * Allows users to preview generated reports before saving them to device storage
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { useTheme } from '@/context/ThemeContext';
import { fileStorageService } from '@/lib/storage/fileStorage.service';
import { logger } from '@/lib/logger';

const { width, height } = Dimensions.get('window');

export interface ReportPreviewData {
  content: string;
  fileName: string;
  format: 'csv' | 'json' | 'html' | 'pdf';
  title: string;
}

interface ReportPreviewModalProps {
  visible: boolean;
  reportData: ReportPreviewData | null;
  onClose: () => void;
  onSave: (data: ReportPreviewData) => Promise<void>;
  onShare?: (data: ReportPreviewData) => Promise<void>;
  isLoading?: boolean;
}

export default function ReportPreviewModal({
  visible,
  reportData,
  onClose,
  onSave,
  onShare,
  isLoading = false,
}: ReportPreviewModalProps) {
  const { colors } = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleSave = async () => {
    if (!reportData) return;
    
    setIsSaving(true);
    try {
      await onSave(reportData);
      // Don't close automatically - let parent handle success state
    } catch (error) {
      logger.error('REPORT_PREVIEW', 'Failed to save report', error);
      Alert.alert('Error', 'Failed to save report. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    if (!reportData || !onShare) return;
    
    setIsSharing(true);
    try {
      await onShare(reportData);
    } catch (error) {
      logger.error('REPORT_PREVIEW', 'Failed to share report', error);
      Alert.alert('Error', 'Failed to share report. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  const renderPreviewContent = () => {
    if (!reportData) return null;

    switch (reportData.format) {
      case 'html':
      case 'pdf':
        return (
          <View style={styles.webViewContainer}>
            <WebView
              source={{ html: reportData.content }}
              style={styles.webView}
              showsVerticalScrollIndicator={true}
              scalesPageToFit={true}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color={colors.tintPrimary} />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    Loading preview...
                  </Text>
                </View>
              )}
            />
          </View>
        );
      
      case 'json':
        return (
          <ScrollView style={styles.textPreviewContainer} showsVerticalScrollIndicator={true}>
            <View style={[styles.codeBlock, { backgroundColor: colors.card }]}>
              <Text style={[styles.codeText, { color: colors.textPrimary }]}>
                {JSON.stringify(JSON.parse(reportData.content), null, 2)}
              </Text>
            </View>
          </ScrollView>
        );
      
      case 'csv':
        return (
          <ScrollView style={styles.textPreviewContainer} showsVerticalScrollIndicator={true}>
            <View style={[styles.codeBlock, { backgroundColor: colors.card }]}>
              <Text style={[styles.csvText, { color: colors.textPrimary }]}>
                {reportData.content}
              </Text>
            </View>
          </ScrollView>
        );
      
      default:
        return (
          <View style={styles.unsupportedContainer}>
            <Ionicons name="document-text" size={64} color={colors.textSecondary} />
            <Text style={[styles.unsupportedText, { color: colors.textSecondary }]}>
              Preview not available for this format
            </Text>
            <Text style={[styles.unsupportedSubtext, { color: colors.textSecondary }]}>
              You can still save or share the report
            </Text>
          </View>
        );
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'html':
      case 'pdf':
        return 'document-text-outline';
      case 'json':
        return 'code-slash-outline';
      case 'csv':
        return 'document-text-outline';
      default:
        return 'document-outline';
    }
  };

  const getFormatColor = (format: string) => {
    switch (format) {
      case 'html':
        return '#ff6b35';
      case 'pdf':
        return '#dc2626';
      case 'json':
        return '#059669';
      case 'csv':
        return '#2563eb';
      default:
        return colors.textSecondary;
    }
  };

  if (!reportData) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity 
            onPress={onClose} 
            style={[styles.closeButton, { backgroundColor: colors.background }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            <View style={styles.headerTitleRow}>
              <Ionicons 
                name={getFormatIcon(reportData.format)} 
                size={20} 
                color={getFormatColor(reportData.format)} 
              />
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                Report Preview
              </Text>
            </View>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {reportData.title} • {reportData.format.toUpperCase()}
            </Text>
          </View>
          
          <View style={styles.closeButton} />
        </View>

        {/* Preview Content */}
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.tintPrimary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Preparing preview...
              </Text>
            </View>
          ) : (
            renderPreviewContent()
          )}
        </View>

        {/* Action Buttons */}
        <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={styles.fileInfo}>
            <Text style={[styles.fileName, { color: colors.textPrimary }]}>
              {reportData.fileName}
            </Text>
            <Text style={[styles.fileSize, { color: colors.textSecondary }]}>
              {fileStorageService.formatFileSize(new TextEncoder().encode(reportData.content).length)}
            </Text>
          </View>
          
          <View style={styles.actionButtons}>
            {onShare && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.shareButton,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    opacity: isSharing ? 0.7 : 1,
                  }
                ]}
                onPress={handleShare}
                disabled={isSharing || isSaving}
                activeOpacity={0.8}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Ionicons name="share" size={20} color={colors.textPrimary} />
                )}
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>
                  {isSharing ? 'Sharing...' : 'Share'}
                </Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.saveButton,
                {
                  backgroundColor: colors.tintPrimary,
                  opacity: isSaving ? 0.7 : 1,
                }
              ]}
              onPress={handleSave}
              disabled={isSaving || isSharing}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="download" size={20} color="#fff" />
              )}
              <Text style={[styles.actionButtonText, { color: '#fff' }]}>
                {isSaving ? 'Saving...' : 'Save to Device'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  webViewContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    gap: 12,
  },
  textPreviewContainer: {
    flex: 1,
    padding: 16,
  },
  codeBlock: {
    padding: 16,
    borderRadius: 12,
    minHeight: height * 0.6,
  },
  codeText: {
    fontFamily: 'Monaco, Menlo, monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  csvText: {
    fontFamily: 'Monaco, Menlo, monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  unsupportedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 40,
  },
  unsupportedText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  unsupportedSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  fileInfo: {
    flex: 1,
    marginRight: 16,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileSize: {
    fontSize: 12,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    minWidth: 100,
    justifyContent: 'center',
  },
  shareButton: {
    borderWidth: 1,
  },
  saveButton: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});