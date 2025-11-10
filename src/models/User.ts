import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'ADMIN' | 'CLERK' | 'SECTION';

export interface UserDoc extends Document {
  email: string;
  passwordHash: string;
  role: UserRole;
  department?: string;
  fullName?: string;
  username?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'CLERK', 'SECTION'], required: true },
    department: { type: String, required: false },
    fullName: { type: String, required: false },
    username: { type: String, required: false, unique: true, sparse: true },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, required: false },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (candidate: string) {
  return bcrypt.compare(candidate, this.passwordHash);
};

export const UserModel = mongoose.model<UserDoc>('User', UserSchema);


