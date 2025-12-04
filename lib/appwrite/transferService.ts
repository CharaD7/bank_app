/**
 * Enhanced Transfer Service
 * 
 * Handles secure transfers with card validation, balance persistence, and transaction logging.
 * Validates recipient cards exist in the database before allowing transfers.
 */

import { databaseService, Query, collections } from './database';
import { AppwriteCardService, updateCardSystem } from './cardService';
import { AppwriteTransactionService } from './transactionService';
import { AppwriteActivityService } from './activityService';
import useAuthStore from '@/store/auth.store'; // Import useAuthStore
import { logger } from '../logger';
import { activityLogger } from '../activityLogger';
import { Card, Transaction } from '@/types';

// Transfer interfaces
export interface TransferRequest {
  sourceCardId: string;
  recipientCardNumber: string;
  amount: number;
  currency?: string;
  description?: string;
  recipientName?: string;
}

export interface TransferResult {
  success: boolean;
  error?: string;
  transactionId?: string;
  sourceNewBalance?: number;
  recipientNewBalance?: number;
  recipientCard?: Card;
  isPending?: boolean;
  recipientCardNumber?: string;
}

export interface CardLookupResult {
  exists: boolean;
  card?: Card;
  isUserCard?: boolean;
  error?: string;
}

// Create service instances to avoid circular dependencies
const cardService = new AppwriteCardService();
const transactionService = new AppwriteTransactionService();
const activityService = new AppwriteActivityService();

/**
 * Enhanced Transfer Service Class
 */
export class AppwriteTransferService {
  
  /**
   * Find a card by its card number across all users
   * This checks if the recipient card exists in the system
   */
  async findCardByNumber(cardNumber: string, currentUserId: string): Promise<CardLookupResult> {
    try {
      const cleanCardNumber = cardNumber.replace(/\D/g, '');
      const last4 = cleanCardNumber.slice(-4);
      
      logger.info('TRANSFER_SERVICE', 'Looking up card by number', {
        inputLength: cleanCardNumber.length,
        last4: last4
      });

      const documents = await databaseService.listDocuments(
        collections.cards.id,
        [
          Query.equal('last4', last4),
          Query.equal('status', 'active'),
          Query.limit(10)
        ]
      );

      logger.info('TRANSFER_SERVICE', 'Documents received from Appwrite:', {
        total: documents.total,
        documents: documents.documents.map(d => ({ id: d.$id, last4: d.last4, holder: d.holder, cardNumber: d.cardNumber ? 'present' : 'missing' }))
      });

      if (documents.documents.length === 0) {
        logger.info('TRANSFER_SERVICE', 'No cards found with matching last 4 digits', { last4 });
        return { exists: false };
      }

      const exactMatches = documents.documents.filter(doc => {
        if (doc.cardNumber) {
          const docCleanNumber = doc.cardNumber.replace(/\D/g, '');
          return docCleanNumber === cleanCardNumber;
        }
        return false;
      });

      if (exactMatches.length === 1) {
        logger.info('TRANSFER_SERVICE', 'Found exact match by full card number');
        const card = this.transformDocumentToCard(exactMatches[0]);
        return {
          exists: true,
          card: card,
          isUserCard: card.userId === currentUserId
        };
      }
      
      if (exactMatches.length > 1) {
        logger.warn('TRANSFER_SERVICE', 'Multiple exact matches found. This should not happen.');
        return { exists: false, error: 'Ambiguous card number. Multiple exact matches found.' };
      }

      // If no exact match, check for unique last4 match
      if (documents.documents.length === 1) {
        logger.info('TRANSFER_SERVICE', 'Found unique match by last4');
        const card = this.transformDocumentToCard(documents.documents[0]);
        return {
          exists: true,
          card: card,
          isUserCard: card.userId === currentUserId
        };
      }
      
      if (documents.documents.length > 1) {
        logger.warn('TRANSFER_SERVICE', 'Multiple cards found with same last4, but no exact match. Ambiguous.', { last4 });
        return { exists: false, error: 'Multiple cards found with the same last 4 digits. Please enter the full card number.' };
      }

      logger.info('TRANSFER_SERVICE', 'No exact or unique card match found', { last4 });
      return { exists: false };
      
    } catch (error) {
      logger.error('TRANSFER_SERVICE', 'Failed to lookup card', error);
      return { exists: false };
    }
  }
  
  /**
   * Validate transfer request and check all preconditions
   */
  async validateTransfer(transferRequest: TransferRequest): Promise<{
    isValid: boolean;
    error?: string;
    sourceCard?: Card;
    recipientCard?: Card;
  }> {
    try {
      const { user } = useAuthStore.getState();
      const currentUserId = user?.$id || user?.id;
      if (!currentUserId) {
        return { isValid: false, error: 'User not authenticated for transfer validation' };
      }

      // 1. Get source card and validate it exists and belongs to user
      const sourceCard = await cardService.getCard(transferRequest.sourceCardId);
      if (!sourceCard) {
        return { isValid: false, error: 'Source card not found' };
      }
      // Ensure source card belongs to current user
      if (sourceCard.userId !== currentUserId) {
        return { isValid: false, error: 'Source card does not belong to the current user' };
      }
      
      // 2. Check if source card has sufficient balance
      if (sourceCard.balance < transferRequest.amount) {
        return { 
          isValid: false, 
          error: `Insufficient funds. Available balance: ${sourceCard.currency || 'GHS'} ${sourceCard.balance.toFixed(2)}` 
        };
      }
      
      // 3. Look up recipient card in database, passing currentUserId
      const cardLookup = await this.findCardByNumber(transferRequest.recipientCardNumber, currentUserId);
      if (!cardLookup.exists || !cardLookup.card) {
        return { 
          isValid: false, 
          error: 'Card not registered on the system' 
        };
      }
      
      // 4. Prevent self-transfers (same card)
      if (cardLookup.card.id === transferRequest.sourceCardId) {
        return { 
          isValid: false, 
          error: 'Cannot transfer to the same card' 
        };
      }
      
      // 5. Validate amount is positive
      if (transferRequest.amount <= 0) {
        return { 
          isValid: false, 
          error: 'Transfer amount must be greater than zero' 
        };
      }
      
      return {
        isValid: true,
        sourceCard: sourceCard,
        recipientCard: cardLookup.card
      };
      
    } catch (error) {
      logger.error('TRANSFER_SERVICE', 'Transfer validation failed', error);
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      };
    }
  }
  
  /**
   * Execute a validated transfer with balance updates and transaction logging
   */
  async executeTransfer(transferRequest: TransferRequest, currentUserId: string): Promise<TransferResult> {
    try {
      logger.info('TRANSFER_SERVICE', 'Starting transfer execution', {
        sourceCardId: transferRequest.sourceCardId,
        amount: transferRequest.amount,
        recipientLast4: transferRequest.recipientCardNumber.slice(-4)
      });
      
      // 1. Validate the transfer
      const validation = await this.validateTransfer(transferRequest);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error
        };
      }
      
      const { sourceCard, recipientCard } = validation;
      if (!sourceCard || !recipientCard) {
        return {
          success: false,
          error: 'Card validation failed'
        };
      }

      // Determine if it's a transfer to the current user's other card
      const isSameUserTransfer = recipientCard.userId === currentUserId;

      if (isSameUserTransfer) {
        logger.info('TRANSFER_SERVICE', 'Executing same-user transfer (immediate)');
        // 2. Calculate new balances (immediate)
        const sourceNewBalance = sourceCard.balance - transferRequest.amount;
        const recipientNewBalance = recipientCard.balance + transferRequest.amount;
        
        logger.info('TRANSFER_SERVICE', 'Calculated new balances', {
          sourceOld: sourceCard.balance,
          sourceNew: sourceNewBalance,
          recipientOld: recipientCard.balance,
          recipientNew: recipientNewBalance
        });
        
        // 3. Update card balances (atomic-like operation) (immediate)
        try {
          // Update source card balance
          await cardService.updateCard(sourceCard.id, {
            balance: sourceNewBalance
          });
          
          // Update recipient card balance (using system update since it may belong to different user)
          await updateCardSystem(recipientCard.id, {
            balance: recipientNewBalance
          });
          
          logger.info('TRANSFER_SERVICE', 'Card balances updated successfully');
          
        } catch (balanceUpdateError) {
          logger.error('TRANSFER_SERVICE', 'Failed to update card balances', balanceUpdateError);
          throw new Error('Failed to update card balances. Transfer aborted.');
        }
        
        // 4. Create transaction records (immediate)
        let sourceTransactionId: string | undefined;
        
        try {
          // Create outgoing transaction for source card
          const sourceTransaction = await transactionService.createTransaction({
            userId: sourceCard.userId,
            cardId: sourceCard.id,
            type: 'transfer',
            amount: -transferRequest.amount, // Negative for outgoing
            currency: transferRequest.currency || sourceCard.currency || 'GHS',
            description: transferRequest.description || `Transfer to ${recipientCard.cardHolderName}`,
            status: 'completed',
            recipient: `${recipientCard.cardHolderName} (${transferRequest.recipientCardNumber})`,
            reference: `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
          });
          
          sourceTransactionId = sourceTransaction.id;
          
          // Create incoming transaction for recipient card
          await transactionService.createTransaction({
            userId: recipientCard.userId,
            cardId: recipientCard.id,
            type: 'transfer',
            amount: transferRequest.amount, // Positive for incoming
            currency: transferRequest.currency || recipientCard.currency || 'GHS',
            description: `Transfer from ${sourceCard.cardHolderName}`,
            status: 'completed',
            sender: `${sourceCard.cardHolderName} (${sourceCard.cardNumber.slice(-4)})`,
            reference: sourceTransaction.reference // Same reference for linked transactions
          });
          
          logger.info('TRANSFER_SERVICE', 'Transaction records created', {
            sourceTransactionId: sourceTransaction.id
          });
          
        } catch (transactionError) {
          logger.error('TRANSFER_SERVICE', 'Failed to create transaction records', transactionError);
          // Note: At this point balances are already updated
          // In a production system, you might want to implement compensation logic
        }
        
        // 5. Clear transfer-related cache (immediate)
        await this.clearTransferCache(sourceCard.id, recipientCard.id);
        
        // 6. Log activity events (fire-and-forget) (immediate)
        this.logTransferActivity(sourceCard, recipientCard, transferRequest.amount, sourceTransactionId);
        
        logger.info('TRANSFER_SERVICE', 'Same-user transfer completed successfully', {
          transactionId: sourceTransactionId,
          sourceNewBalance: sourceNewBalance,
          recipientNewBalance: recipientNewBalance
        });
        
        return {
          success: true,
          transactionId: sourceTransactionId,
          sourceNewBalance: sourceNewBalance,
          recipientNewBalance: recipientNewBalance,
          recipientCard: recipientCard,
          recipientCardNumber: transferRequest.recipientCardNumber
        };

      } else { // Cross-user transfer
        logger.info('TRANSFER_SERVICE', 'Executing cross-user transfer (pending)');
        // 2. Update source card balance immediately (outgoing)
        const sourceNewBalance = sourceCard.balance - transferRequest.amount;
        try {
          await cardService.updateCard(sourceCard.id, {
            balance: sourceNewBalance
          });
          logger.info('TRANSFER_SERVICE', 'Source card balance updated for pending transfer');
        } catch (balanceUpdateError) {
          logger.error('TRANSFER_SERVICE', 'Failed to update source card balance for pending transfer', balanceUpdateError);
          throw new Error('Failed to update source card balance. Transfer aborted.');
        }
        
        // 3. Create a pending transaction for the source card
        let sourceTransactionId: string | undefined;
        try {
          const sourceTransaction = await transactionService.createTransaction({
            userId: sourceCard.userId,
            cardId: sourceCard.id,
            type: 'transfer',
            amount: -transferRequest.amount, // Negative for outgoing
            currency: transferRequest.currency || sourceCard.currency || 'GHS',
            description: transferRequest.description || `Pending transfer to ${recipientCard.cardHolderName}`,
            status: 'pending', // Mark as pending
            recipient: `${recipientCard.cardHolderName} (${transferRequest.recipientCardNumber})`,
            reference: `TXN-PENDING-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
          });
          sourceTransactionId = sourceTransaction.id;
          logger.info('TRANSFER_SERVICE', 'Pending transaction created for source card');
        } catch (transactionError) {
          logger.error('TRANSFER_SERVICE', 'Failed to create pending transaction record', transactionError);
          // Revert source card balance if transaction creation fails?
          // For now, log and return error
          throw new Error('Failed to create pending transaction record.');
        }
        
        // 4. Log activity events (fire-and-forget)
        this.logTransferActivity(sourceCard, recipientCard, transferRequest.amount, sourceTransactionId, 'pending');

        logger.info('TRANSFER_SERVICE', 'Cross-user transfer initiated (pending)', {
          transactionId: sourceTransactionId,
          sourceNewBalance: sourceNewBalance
        });
        
        return {
          success: true,
          isPending: true, // Indicate that this transfer is pending
          transactionId: sourceTransactionId,
          sourceNewBalance: sourceNewBalance,
          recipientCard: recipientCard, // Still return recipient info for modal
          recipientCardNumber: transferRequest.recipientCardNumber
        };
      }
      
    } catch (error) {
      logger.error('TRANSFER_SERVICE', 'Transfer execution failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transfer failed'
      };
    }
  }
  
  /**
   * Clear transfer-related cache and refresh data
   */
  private async clearTransferCache(sourceCardId: string, recipientCardId: string): Promise<void> {
    try {
      // Import AsyncStorage for cache cleanup
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      
      // Clear transaction cache that might be stale
      await AsyncStorage.removeItem('cached_transactions');
      await AsyncStorage.removeItem('transaction_cache');
      
      // Clear card balance cache
      await AsyncStorage.removeItem(`card_balance_${sourceCardId}`);
      await AsyncStorage.removeItem(`card_balance_${recipientCardId}`);
      
      // Clear any transfer history cache
      await AsyncStorage.removeItem('transfer_history');
      
      logger.info('TRANSFER_SERVICE', 'Transfer cache cleared successfully');
    } catch (error) {
      logger.warn('TRANSFER_SERVICE', 'Failed to clear transfer cache', error);
      // Non-critical error - don't fail the transfer
    }
  }
  
  /**
   * Trigger auto-refresh of relevant data after successful transfer
   */
  private async triggerAutoRefresh(sourceCardId: string, recipientCardId: string): Promise<void> {
    try {
      logger.info('TRANSFER_SERVICE', 'Transfer completed, data refresh will be handled by calling component');
      
      // Note: Data refresh is now handled by the calling component (makeTransfer in AppContext)
      // This avoids circular import issues and keeps the refresh logic where it belongs
      
      // The transfer service just focuses on the core transfer logic
      // Refresh is triggered in AppContext after successful transfer
      
    } catch (error) {
      logger.warn('TRANSFER_SERVICE', 'Failed to log refresh trigger', error);
      // Non-critical error
    }
  }
  
  /**
   * Log transfer activity events using centralized logger (fire-and-forget)
   */
  private async logTransferActivity(
    sourceCard: Card, 
    recipientCard: Card, 
    amount: number, 
    transactionId?: string,
    status: 'completed' | 'pending' | 'failed' = 'completed' // Add status parameter
  ): Promise<void> {
    try {
      // Log outgoing transfer activity for sender using centralized logger
      await activityLogger.logTransactionActivity(
        status, // Use the provided status
        transactionId || `transfer_${Date.now()}`,
        {
          type: 'transfer',
          amount: amount,
          cardId: sourceCard.id,
          recipientCardId: recipientCard.id,
          description: `Transfer sent to ${recipientCard.cardHolderName}`
        },
        sourceCard.userId
      );
      
      // Only log incoming activity if the status is completed
      if (status === 'completed') {
        // Log incoming transfer activity for recipient using centralized logger
        await activityLogger.logTransactionActivity(
          status,
          transactionId || `transfer_${Date.now()}_in`,
          {
            type: 'transfer',
            amount: amount,
            cardId: recipientCard.id,
            recipientCardId: sourceCard.id,
            description: `Transfer received from ${sourceCard.cardHolderName}`
          },
          recipientCard.userId
        );
      }

      logger.info('TRANSFER_SERVICE', 'Transfer activity logged successfully');
      
    } catch (error) {
      logger.warn('TRANSFER_SERVICE', 'Failed to log transfer activity', error);
      // Don't fail the transfer for activity logging issues
    }
  }
  
  /**
   * Transform Appwrite document to Card type
   */
  private transformDocumentToCard(doc: any): Card {
    return {
      id: doc.$id,
      userId: doc.userId,
      cardNumber: doc.cardNumber || `****-****-****-${doc.last4}`,
      cardHolderName: doc.holder || doc.cardHolderName,
      expiryDate: doc.exp_month 
        ? `${doc.exp_month.toString().padStart(2, '0')}/${doc.exp_year.toString().slice(-2)}`
        : doc.expiryDate,
      cardType: doc.brand || doc.cardType || 'card',
      cardColor: doc.color || doc.cardColor || '#1e40af',
          balance: doc.balance ? doc.balance : 0, // Use balance as is (display value integer)
          currency: doc.currency || 'GHS',
          token: doc.token,      isActive: doc.status ? (doc.status !== 'inactive') : (doc.isActive !== false),
    };
  }
}

// Export singleton instance
export const transferService = new AppwriteTransferService();
export default transferService;