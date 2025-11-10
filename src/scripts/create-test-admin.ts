import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User';
import { env } from '../config/env';

async function createTestAdmin() {
  try {
    await mongoose.connect(env.mongoUri);
    console.log('Connected to MongoDB');

    const email = 'admin@tapalwala.com';
    const password = 'admin123';
    const role = 'ADMIN';
    const fullName = 'Test Administrator';
    const username = 'admin';

    // Check if admin already exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      console.log(`Admin user with email ${email} already exists.`);
      console.log('Login credentials:');
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({ 
      email, 
      passwordHash, 
      role,
      fullName,
      username,
      isActive: true
    });

    console.log('✅ Test Admin user created successfully!');
    console.log('Login credentials:');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Full Name: ${fullName}`);
    console.log(`Username: ${username}`);
    console.log(`Role: ${role}`);
    
  } catch (error) {
    console.error('Error creating test admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

if (require.main === module) {
  createTestAdmin();
}

