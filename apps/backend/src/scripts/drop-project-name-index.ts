import connectDB from '../lib/database';
import mongoose from 'mongoose';

async function dropProjectNameIndex() {
  try {
    console.info('🔧 Dropping unique index on Project.name field...');

    // Connect to database
    await connectDB();

    const db = mongoose.connection.db;
    const collection = db.collection('projects');

    // Check if the index exists first
    const indexes = await collection.indexes();
    const nameIndexExists = indexes.some(index =>
      index.key && index.key.name === 1 && index.unique === true
    );

    if (nameIndexExists) {
      // Drop the unique index on the name field
      await collection.dropIndex({ name: 1 });
      console.info('✅ Successfully dropped unique index on name field');
    } else {
      console.info('ℹ️  No unique index found on name field');
    }

    // Create unique index on slug field if it doesn't exist
    const slugIndexExists = indexes.some(index =>
      index.key && index.key.slug === 1 && index.unique === true
    );

    if (!slugIndexExists) {
      await collection.createIndex({ slug: 1 }, { unique: true });
      console.info('✅ Successfully created unique index on slug field');
    } else {
      console.info('ℹ️  Unique index on slug field already exists');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run migration
dropProjectNameIndex();
