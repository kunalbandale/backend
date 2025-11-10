import mongoose from 'mongoose';
import { DepartmentModel } from '../models/Department';
import { env } from '../config/env';

const departments = [
  { name: 'MAG', code: 'MAG', description: 'MAG Department', isActive: true },
  { name: 'SGY', code: 'SGY', description: 'SGY Department', isActive: true },
  { name: 'Appeal', code: 'APPEAL', description: 'Appeal Department', isActive: true },
  { name: 'GB-I', code: 'GB1', description: 'GB-I Department', isActive: true },
  { name: 'GB-II', code: 'GB2', description: 'GB-II Department', isActive: true },
  { name: 'Land ACQ (Coordination)', code: 'LACQ_COORD', description: 'Land ACQ Coordination Department', isActive: true },
  { name: 'Land ACQ (PTMIW)', code: 'LACQ_PTMIW', description: 'Land ACQ PTMIW Department', isActive: true },
  { name: 'Mining', code: 'MINING', description: 'Mining Department', isActive: true },
  { name: 'Rehabilitation', code: 'REHAB', description: 'Rehabilitation Department', isActive: true },
  { name: 'MREGS', code: 'MREGS', description: 'MREGS Department', isActive: true },
  { name: 'Election', code: 'ELECTION', description: 'Election Department', isActive: true },
  { name: 'Supply Office', code: 'SUPPLY', description: 'Supply Office Department', isActive: true },
  { name: 'Establishment', code: 'ESTAB', description: 'Establishment Department', isActive: true },
  { name: 'NIC (Setu)', code: 'NIC_SETU', description: 'NIC Setu Department', isActive: true },
  { name: 'Store Branch', code: 'STORE', description: 'Store Branch Department', isActive: true },
  { name: 'Law Officer', code: 'LAW', description: 'Law Officer Department', isActive: true },
  { name: 'PA to Collector', code: 'PA_COLLECTOR', description: 'PA to Collector Department', isActive: true },
  { name: 'Record Room', code: 'RECORD', description: 'Record Room Department', isActive: true },
  { name: 'DPO', code: 'DPO', description: 'DPO Department', isActive: true },
  { name: 'Disaster Management', code: 'DISASTER', description: 'Disaster Management Department', isActive: true },
  { name: 'Accounts Office', code: 'ACCOUNTS', description: 'Accounts Office Department', isActive: true },
  { name: 'Land ACQ - III', code: 'LACQ3', description: 'Land ACQ III Department', isActive: true }
];

async function seedDepartments() {
  try {
    await mongoose.connect(env.mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing departments
    await DepartmentModel.deleteMany({});
    console.log('Cleared existing departments');

    // Insert new departments
    const createdDepartments = await DepartmentModel.insertMany(departments);
    console.log(`Created ${createdDepartments.length} departments:`);
    
    createdDepartments.forEach(dept => {
      console.log(`- ${dept.name} (${dept.code})`);
    });

    console.log('Department seeding completed successfully');
  } catch (error) {
    console.error('Error seeding departments:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the seed function if this file is executed directly
if (require.main === module) {
  seedDepartments();
}

export { seedDepartments };
