/**
 * Report Generation Integration Example
 * 
 * Shows how to integrate the enhanced ReportStatusModal with storage features
 * Demonstrates proper usage of view/save/share functionality for financial reports
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { logger } from '../lib/logger';
import ReportStatusModal from '../components/ReportStatusModal';
import { shareAsync } from 'expo-sharing';

// Mock report data
const generateSampleCSVReport = (): string => {
  const headers = 'Date,Description,Amount,Category,Balance\n';
  const rows = [
    '2024-01-15,"Coffee Shop Purchase",-4.50,Food,1245.50',
    '2024-01-14,"Salary Deposit",2500.00,Income,1250.00',
    '2024-01-13,"Grocery Store",-89.32,Food,-1250.00',
    '2024-01-12,"Gas Station",-45.00,Transportation,-1160.68',
    '2024-01-11,"Online Transfer",-200.00,Transfer,-1115.68',
  ];
  return headers + rows.join('\n');
};

const generateSampleJSONReport = (): string => {
  const data = {
    reportInfo: {
      generatedAt: new Date().toISOString(),
      type: 'Financial Summary',
      period: 'January 2024',
      currency: 'USD'
    },
    summary: {
      totalIncome: 2500.00,
      totalExpenses: 338.82,
      netChange: 2161.18,
      transactionCount: 5
    },
    transactions: [
      {
        date: '2024-01-15',
        description: 'Coffee Shop Purchase',
        amount: -4.50,
        category: 'Food',
        balance: 1245.50
      },
      {
        date: '2024-01-14',
        description: 'Salary Deposit',
        amount: 2500.00,
        category: 'Income',
        balance: 1250.00
      },
      {
        date: '2024-01-13',
        description: 'Grocery Store',
        amount: -89.32,
        category: 'Food',
        balance: -1250.00
      },
      {
        date: '2024-01-12',
        description: 'Gas Station',
        amount: -45.00,
        category: 'Transportation',
        balance: -1160.68
      },
      {
        date: '2024-01-11',
        description: 'Online Transfer',
        amount: -200.00,
        category: 'Transfer',
        balance: -1115.68
      }
    ]
  };
  return JSON.stringify(data, null, 2);
};

const generateSampleHTMLReport = (): string => {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Financial Report - January 2024</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .summary { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .summary div { background: #e3f2fd; padding: 10px; border-radius: 4px; text-align: center; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .positive { color: #4CAF50; }
        .negative { color: #F44336; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Financial Report</h1>
        <p>Period: January 2024 | Generated: ${new Date().toLocaleDateString()}</p>
    </div>
    
    <div class="summary">
        <div>
            <h3>Total Income</h3>
            <p class="positive">$2,500.00</p>
        </div>
        <div>
            <h3>Total Expenses</h3>
            <p class="negative">$338.82</p>
        </div>
        <div>
            <h3>Net Change</h3>
            <p class="positive">$2,161.18</p>
        </div>
    </div>
    
    <h2>Transaction History</h2>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Balance</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>2024-01-15</td>
                <td>Coffee Shop Purchase</td>
                <td class="negative">-$4.50</td>
                <td>Food</td>
                <td>$1,245.50</td>
            </tr>
            <tr>
                <td>2024-01-14</td>
                <td>Salary Deposit</td>
                <td class="positive">$2,500.00</td>
                <td>Income</td>
                <td>$1,250.00</td>
            </tr>
            <tr>
                <td>2024-01-13</td>
                <td>Grocery Store</td>
                <td class="negative">-$89.32</td>
                <td>Food</td>
                <td>-$1,250.00</td>
            </tr>
            <tr>
                <td>2024-01-12</td>
                <td>Gas Station</td>
                <td class="negative">-$45.00</td>
                <td>Transportation</td>
                <td>-$1,160.68</td>
            </tr>
            <tr>
                <td>2024-01-11</td>
                <td>Online Transfer</td>
                <td class="negative">-$200.00</td>
                <td>Transfer</td>
                <td>-$1,115.68</td>
            </tr>
        </tbody>
    </table>
</body>
</html>
  `.trim();
};

interface ReportOption {
  format: 'csv' | 'json' | 'html' | 'pdf';
  title: string;
  description: string;
  icon: string;
  generator: () => string;
}

const ReportGenerationExample: React.FC = () => {
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStatus, setModalStatus] = useState<'loading' | 'success' | 'error' | 'idle'>('idle');
  const [currentReport, setCurrentReport] = useState<{
    content: string;
    fileName: string;
    format: 'csv' | 'json' | 'html' | 'pdf';
  } | null>(null);

  const reportOptions: ReportOption[] = [
    {
      format: 'csv',
      title: 'CSV Report',
      description: 'Spreadsheet format, perfect for Excel or Google Sheets',
      icon: 'document-text',
      generator: generateSampleCSVReport
    },
    {
      format: 'json',
      title: 'JSON Report',
      description: 'Structured data format for developers and APIs',
      icon: 'code-slash',
      generator: generateSampleJSONReport
    },
    {
      format: 'html',
      title: 'HTML Report',
      description: 'Web page format with styling, opens in any browser',
      icon: 'globe',
      generator: generateSampleHTMLReport
    },
    {
      format: 'pdf',
      title: 'PDF Report',
      description: 'Professional document format (Demo - generates HTML)',
      icon: 'document',
      generator: generateSampleHTMLReport // For demo, using HTML content
    }
  ];

  const generateReport = async (option: ReportOption) => {
    try {
      logger.info('REPORT_EXAMPLE', 'Starting report generation', {
        format: option.format,
        title: option.title
      });

      // Show loading modal
      setModalStatus('loading');
      setModalVisible(true);

      // Simulate report generation delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate report content
      const content = option.generator();
      const fileName = `financial-report-${new Date().toISOString().split('T')[0]}.${option.format}`;

      setCurrentReport({
        content,
        fileName,
        format: option.format
      });

      // Show success modal
      setModalStatus('success');

      logger.info('REPORT_EXAMPLE', 'Report generated successfully', {
        fileName,
        contentLength: content.length
      });

    } catch (error) {
      logger.error('REPORT_EXAMPLE', 'Failed to generate report', error);
      setModalStatus('error');
    }
  };

  const handleViewReport = () => {
    if (!currentReport) return;

    logger.info('REPORT_EXAMPLE', 'User viewing report inline', {
      fileName: currentReport.fileName,
      format: currentReport.format
    });

    // For demo purposes, show a preview in an alert
    // In a real app, you'd navigate to a report viewer screen
    const preview = currentReport.content.length > 200 
      ? currentReport.content.substring(0, 200) + '...' 
      : currentReport.content;

    Alert.alert(
      `📊 ${currentReport.format.toUpperCase()} Report Preview`,
      preview,
      [
        { text: 'Full Screen View', onPress: () => {
          Alert.alert('Demo', 'In a real app, this would open a full-screen report viewer.');
        }},
        { text: 'Close', style: 'cancel' }
      ]
    );
  };

  const handleShareReport = async () => {
    if (!currentReport) return;

    try {
      logger.info('REPORT_EXAMPLE', 'User sharing report', {
        fileName: currentReport.fileName,
        format: currentReport.format
      });

      // For demo purposes, simulate sharing
      // In a real app, you'd use expo-sharing or similar
      Alert.alert(
        'Share Report 📤',
        `Would you like to share "${currentReport.fileName}"?\n\nFormat: ${currentReport.format.toUpperCase()}\nSize: ${(currentReport.content.length / 1024).toFixed(1)} KB`,
        [
          {
            text: 'Share via Email',
            onPress: () => Alert.alert('Demo', 'In a real app, this would open the email app with the report attached.')
          },
          {
            text: 'Share via Messages',
            onPress: () => Alert.alert('Demo', 'In a real app, this would open messaging with the report.')
          },
          {
            text: 'More Options',
            onPress: () => Alert.alert('Demo', 'In a real app, this would show system share sheet.')
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );

    } catch (error) {
      logger.error('REPORT_EXAMPLE', 'Failed to share report', error);
      Alert.alert('Share Failed', 'Unable to share report. Please try again.');
    }
  };

  const handleRetryGeneration = () => {
    logger.info('REPORT_EXAMPLE', 'User retrying report generation');
    setModalStatus('idle');
    setModalVisible(false);
    setCurrentReport(null);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setModalStatus('idle');
  };

  const renderReportOption = (option: ReportOption) => (
    <TouchableOpacity
      key={option.format}
      style={[styles.reportOption, { 
        backgroundColor: colors.card,
        borderColor: colors.border 
      }]}
      onPress={() => generateReport(option)}
      activeOpacity={0.8}
    >
      <View style={[styles.reportIconContainer, { backgroundColor: colors.tintSoftBg }]}>
        <Ionicons name={option.icon as any} size={24} color={colors.tintPrimary} />
      </View>
      
      <View style={styles.reportInfo}>
        <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>
          {option.title}
        </Text>
        <Text style={[styles.reportDescription, { color: colors.textSecondary }]}>
          {option.description}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            📊 Generate Financial Reports
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Create, view, save, and share your financial data in different formats
          </Text>
        </View>

        {/* Report Options */}
        <View style={styles.optionsContainer}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Choose Report Format
          </Text>
          {reportOptions.map(renderReportOption)}
        </View>

        {/* Features Info */}
        <View style={[styles.featuresSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.featuresTitle, { color: colors.textPrimary }]}>
            ✨ Enhanced Features
          </Text>
          
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="eye" size={16} color={colors.positive} />
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                View reports inline before saving
              </Text>
            </View>
            
            <View style={styles.featureItem}>
              <Ionicons name="download" size={16} color={colors.positive} />
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                Save directly to device storage
              </Text>
            </View>
            
            <View style={styles.featureItem}>
              <Ionicons name="share" size={16} color={colors.positive} />
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                Share via email, messages, or other apps
              </Text>
            </View>
            
            <View style={styles.featureItem}>
              <Ionicons name="shield-checkmark" size={16} color={colors.positive} />
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                Smart permission handling
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Enhanced Report Status Modal */}
      <ReportStatusModal
        visible={modalVisible}
        onClose={handleCloseModal}
        status={modalStatus}
        reportFormat={currentReport?.format}
        fileName={currentReport?.fileName}
        reportContent={currentReport?.content}
        onView={handleViewReport}
        onShare={handleShareReport}
        onRetry={handleRetryGeneration}
        errorMessage={modalStatus === 'error' ? 'Failed to generate report. Please check your connection and try again.' : undefined}
        loadingMessage="Generating your financial report with enhanced features..."
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  optionsContainer: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  reportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  reportIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  reportDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  featuresSection: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 18,
  },
});

export default ReportGenerationExample;