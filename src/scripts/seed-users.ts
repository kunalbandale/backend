import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User';
import { env } from '../config/env';

const users = [
  {
    email: 'akashtayade5668@gmail.com',
    password: 'password123',
    role: 'ADMIN'
  },
  {
    email: 'section.mag@test.com',
    password: 'password123',
    role: 'SECTION',
    department: 'MAG'
  },
  {
    email: 'section.sgy@test.com',
    password: 'password123',
    role: 'SECTION',
    department: 'SGY'
  },
  {
    email: 'section.appeal@test.com',
    password: 'password123',
    role: 'SECTION',
    department: 'APPEAL'
  }
];

async function seedUsers() {
  try {
    await mongoose.connect(env.mongoUri);
    console.log('Connected to MongoDB');

    // Create users (skip if they already exist)
    for (const userData of users) {
      const existingUser = await UserModel.findOne({ email: userData.email });
      if (existingUser) {
        console.log(`${userData.role} user already exists:`, userData.email);
        continue;
      }

      const passwordHash = await bcrypt.hash(userData.password, 10);
      const user = await UserModel.create({
        email: userData.email,
        passwordHash,
        role: userData.role,
        department: userData.department
      });
      console.log(`Created ${userData.role} user:`, user.email, userData.department ? `(${userData.department})` : '');
    }

    console.log('User seeding completed successfully');
  } catch (error) {
    console.error('Error seeding users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the seed function if this file is executed directly
if (require.main === module) {
  seedUsers();
}

export { seedUsers };


