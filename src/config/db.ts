import mongoose from 'mongoose';
import { env } from './env';

export async function connectToDatabase(): Promise<void> {
  try {
    console.log('Connecting to MongoDB...');
    console.log('MongoDB URI:', env.mongoUri);
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    } as any);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}


