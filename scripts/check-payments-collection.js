#!/usr/bin/env node

/**
 * Check if payments collection exists and create if missing
 */

const { Client, Databases, ID, Permission, Role } = require('appwrite');
const path = require('path');

// Configuration
const config = {
  endpoint: process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1',
  projectId: process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || '687e11300022c06f9c64',
  databaseId: process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID || '688951e80021396d424f',
  paymentsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_PAYMENTS_COLLECTION_ID || 'payments',
  // Use an API key if available, otherwise rely on session (must be run by authenticated admin)
  apiKey: process.env.APPWRITE_API_KEY
};

console.log('🔍 Checking payments collection configuration...\n');

// Initialize client
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId);

// Add API key if available
if (config.apiKey) {
  client.setKey(config.apiKey);
  console.log('✅ Using API key for admin access');
} else {
  console.log('⚠️  No API key provided - checking collection only (no creation)');
}

const databases = new Databases(client);

async function checkPaymentsCollection() {
  try {
    console.log(`📋 Checking if payments collection exists...`);
    console.log(`   Database ID: ${config.databaseId}`);
    console.log(`   Collection ID: ${config.paymentsCollectionId}\n`);

    // Try to list collections and find the payments collection
    try {
      const collectionsResponse = await databases.list(config.databaseId);
      const paymentsCollection = collectionsResponse.collections?.find(c => c.$id === config.paymentsCollectionId);
      
      if (!paymentsCollection) {
        throw { code: 404, message: 'Collection not found' };
      }
      
      console.log('✅ Payments collection found!');
      console.log(`   Name: ${paymentsCollection.name}`);
      console.log(`   Collection ID: ${paymentsCollection.$id}`);
      console.log(`   Total Documents: ${paymentsCollection.documentsCount || 'N/A'}`);
      console.log(`   Created: ${paymentsCollection.$createdAt}`);
      console.log(`   Updated: ${paymentsCollection.$updatedAt}\n`);

      // Check permissions
      if (paymentsCollection.$permissions && paymentsCollection.$permissions.length > 0) {
        console.log('📋 Collection Permissions:');
        paymentsCollection.$permissions.forEach(permission => {
          console.log(`   - ${permission}`);
        });
      } else {
        console.log('⚠️  No permissions set on collection (this might cause access issues)');
      }

      return true;
    } catch (getError) {
      if (getError.code === 404) {
        console.log('❌ Payments collection not found');
        console.log(`   Collection ID '${config.paymentsCollectionId}' does not exist in database '${config.databaseId}'`);
        
        if (config.apiKey) {
          console.log('\n🔧 Attempting to create payments collection...');
          return await createPaymentsCollection();
        } else {
          console.log('\n💡 To create the collection automatically, set APPWRITE_API_KEY environment variable');
          console.log('   Or create it manually in the Appwrite Console with these attributes:');
          console.log(getCollectionSchema());
          return false;
        }
      } else {
        throw getError;
      }
    }
  } catch (error) {
    console.error('❌ Error checking payments collection:', error.message);
    
    if (error.code === 401) {
      console.log('\n💡 Authentication error. Make sure:');
      console.log('   1. APPWRITE_API_KEY is set with proper permissions');
      console.log('   2. Or run this from an authenticated session');
    } else if (error.code === 404) {
      console.log('\n💡 Database not found. Check:');
      console.log('   1. EXPO_PUBLIC_APPWRITE_DATABASE_ID is correct');
      console.log('   2. Database exists in the project');
    }
    
    return false;
  }
}

async function createPaymentsCollection() {
  try {
    const permissions = [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
      // Also allow guests with CRUD permissions
      Permission.read(Role.guests()),
      Permission.create(Role.guests()),
      Permission.update(Role.guests()),
      Permission.delete(Role.guests())
    ];

    // Create the collection
    const collection = await databases.createCollection(
      config.databaseId,
      config.paymentsCollectionId,
      'Payments',
      permissions
    );

    console.log('✅ Payments collection created successfully!');
    console.log(`   Collection ID: ${collection.$id}`);
    console.log(`   Name: ${collection.name}\n`);

    // Create required attributes
    console.log('📋 Creating collection attributes...');
    
    const attributes = [
      { key: 'userId', type: 'string', size: 255, required: true, array: false },
      { key: 'cardId', type: 'string', size: 255, required: false, array: false },
      { key: 'type', type: 'string', size: 50, required: true, array: false },
      { key: 'amount', type: 'integer', required: true, min: 0 },
      { key: 'currency', type: 'string', size: 10, required: true, default: 'GHS' },
      { key: 'description', type: 'string', size: 500, required: false },
      { key: 'recipientId', type: 'string', size: 255, required: false },
      { key: 'recipientDetails', type: 'string', size: 1000, required: false },
      { key: 'status', type: 'string', size: 50, required: true, default: 'pending' },
      { key: 'reference', type: 'string', size: 255, required: true },
      { key: 'metadata', type: 'string', size: 2000, required: false },
      { key: 'mobileNumber', type: 'string', size: 20, required: false },
      { key: 'mobileNetwork', type: 'string', size: 50, required: false },
      { key: 'bankCode', type: 'string', size: 20, required: false },
      { key: 'accountNumber', type: 'string', size: 50, required: false }
    ];

    for (const attr of attributes) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(
            config.databaseId,
            config.paymentsCollectionId,
            attr.key,
            attr.size,
            attr.required,
            attr.default,
            attr.array
          );
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(
            config.databaseId,
            config.paymentsCollectionId,
            attr.key,
            attr.required,
            attr.min,
            undefined, // max
            attr.default,
            attr.array
          );
        }
        console.log(`   ✅ Created attribute: ${attr.key} (${attr.type})`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (attrError) {
        console.log(`   ⚠️  Failed to create attribute ${attr.key}:`, attrError.message);
      }
    }

    console.log('\n🎉 Payments collection setup complete!');
    console.log('   The collection should be ready for use once attributes are processed.');
    console.log('   Note: It may take a few minutes for all attributes to be active.');

    return true;
  } catch (createError) {
    console.error('❌ Failed to create payments collection:', createError.message);
    return false;
  }
}

function getCollectionSchema() {
  return `
📋 Payments Collection Schema:
   Collection ID: ${config.paymentsCollectionId}
   
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
   - Read: Users, Guests
   - Create: Users, Guests
   - Update: Users, Guests
   - Delete: Users, Guests
`;
}

// Run the check
if (require.main === module) {
  checkPaymentsCollection()
    .then(success => {
      console.log('\n' + '='.repeat(60));
      console.log(success ? '✅ CHECK COMPLETE' : '❌ CHECK FAILED');
      console.log('='.repeat(60));
      
      if (!success) {
        console.log('\n💡 Next Steps:');
        console.log('1. Create the payments collection manually in Appwrite Console');
        console.log('2. Or set APPWRITE_API_KEY and run this script again');
        console.log('3. Ensure guests have CRUD permissions on the collection');
      }
      
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { checkPaymentsCollection, getCollectionSchema };