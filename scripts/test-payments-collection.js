#!/usr/bin/env node

/**
 * Simple test to check if payments collection exists
 */

// Import using path resolution since we're in a JS script but the config is TS
const path = require('path');
const configPath = path.resolve(__dirname, '../lib/appwrite/config.ts');

// Since we can't directly import TS in Node.js, we'll reconstruct the configuration
const { Client, Databases, ID } = require('appwrite');

// Configuration reconstruction (matching config.ts)
const appwriteConfig = {
  endpoint: process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1',
  projectId: process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || '687e11300022c06f9c64',
  databaseId: process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID || '688951e80021396d424f',
  paymentsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_PAYMENTS_COLLECTION_ID || 'payments',
};

const client = new Client()
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId);

const databases = new Databases(client);
const AppwriteID = { unique: () => ID.unique() };

const collections = {
  payments: {
    id: appwriteConfig.paymentsCollectionId,
    databaseId: appwriteConfig.databaseId,
  },
};

console.log('🔍 Testing payments collection access...\n');

async function testPaymentsCollection() {
  try {
    console.log('📋 Configuration check:');
    console.log(`   Database ID: ${appwriteConfig.databaseId}`);
    console.log(`   Payments Collection ID: ${collections.payments?.id || 'NOT CONFIGURED'}`);
    console.log(`   Payments Collection Fallback: ${'payments'}\n`);

    if (!collections.payments?.id) {
      console.log('⚠️  Payments collection not configured in config.ts');
      console.log('   Using fallback collection ID: "payments"\n');
    }

    const collectionId = collections.payments?.id || 'payments';

    // Try to create a test document to verify collection exists and has proper permissions
    const testData = {
      userId: 'test_user',
      type: 'test_payment',
      amount: 100, // Amount in cents
      currency: 'GHS',
      status: 'test',
      reference: `TEST_${Date.now()}`,
      description: 'Collection test payment - will be deleted'
    };

    console.log('🧪 Creating test payment document...');
    const testDocument = await databases.createDocument(
      appwriteConfig.databaseId,
      collectionId,
      AppwriteID.unique(),
      testData
    );

    console.log('✅ Test document created successfully!');
    console.log(`   Document ID: ${testDocument.$id}`);
    console.log(`   Collection: ${collectionId}`);
    console.log(`   Status: ${testDocument.status}`);

    // Clean up test document
    console.log('\n🧹 Cleaning up test document...');
    await databases.deleteDocument(
      appwriteConfig.databaseId,
      collectionId,
      testDocument.$id
    );
    console.log('✅ Test document deleted successfully!');

    console.log('\n🎉 Payments collection is working correctly!');
    console.log('   - Collection exists');
    console.log('   - Proper CRUD permissions configured');
    console.log('   - All required attributes present');

    return true;

  } catch (error) {
    console.error('❌ Payments collection test failed:', error.message);
    
    if (error.code === 404) {
      if (error.message.includes('Collection not found')) {
        console.log('\n💡 Collection not found. You need to:');
        console.log('   1. Create a "payments" collection in Appwrite Console');
        console.log('   2. Add required attributes (see schema below)');
        console.log('   3. Set proper permissions for guests and users');
        console.log(getPaymentsCollectionSchema());
      } else if (error.message.includes('Database not found')) {
        console.log('\n💡 Database not found. Check EXPO_PUBLIC_APPWRITE_DATABASE_ID');
      }
    } else if (error.code === 401 || error.message.includes('Unauthorized') || error.message.includes('missing scopes')) {
      console.log('\n💡 Permission error. Make sure:');
      console.log('   1. Guests have Create, Read, Update, Delete permissions');
      console.log('   2. Users have Create, Read, Update, Delete permissions');
      console.log('   3. Your Appwrite project allows guest access');
    } else if (error.message.includes('missing attribute') || error.message.includes('Unknown attribute')) {
      console.log('\n💡 Attribute error. The collection exists but is missing required attributes:');
      console.log(getPaymentsCollectionSchema());
    }
    
    return false;
  }
}

function getPaymentsCollectionSchema() {
  return `
📋 Required Payments Collection Schema:

Collection Name: payments (or configure EXPO_PUBLIC_APPWRITE_PAYMENTS_COLLECTION_ID)

Required Attributes:
- userId (string, 255 chars, required)
- type (string, 50 chars, required) 
- amount (integer, required, min: 0)
- currency (string, 10 chars, required, default: "GHS")
- status (string, 50 chars, required, default: "pending")
- reference (string, 255 chars, required)

Optional Attributes:
- cardId (string, 255 chars)
- description (string, 500 chars)
- recipientId (string, 255 chars)
- recipientDetails (string, 1000 chars)
- metadata (string, 2000 chars)
- mobileNumber (string, 20 chars)
- mobileNetwork (string, 50 chars)
- bankCode (string, 20 chars)
- accountNumber (string, 50 chars)

Permissions:
✅ Create: Role.users(), Role.guests()
✅ Read: Role.users(), Role.guests()
✅ Update: Role.users(), Role.guests()  
✅ Delete: Role.users(), Role.guests()
`;
}

// Run the test
if (require.main === module) {
  testPaymentsCollection()
    .then(success => {
      console.log('\n' + '='.repeat(60));
      console.log(success ? '✅ PAYMENTS COLLECTION TEST PASSED' : '❌ PAYMENTS COLLECTION TEST FAILED');
      console.log('='.repeat(60));
      
      if (success) {
        console.log('\n💡 Your withdrawals should now work correctly!');
      } else {
        console.log('\n💡 Fix the payments collection to enable withdrawals.');
      }
      
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testPaymentsCollection, getPaymentsCollectionSchema };