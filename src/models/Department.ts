import mongoose, { Schema, Document } from 'mongoose';

export interface DepartmentDoc extends Document {
  name: string;
  code: string; 
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<DepartmentDoc>(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Index for efficient lookups
DepartmentSchema.index({ code: 1, isActive: 1 });
// Note: name field already has unique: true which creates an index automatically

export const DepartmentModel = mongoose.model<DepartmentDoc>('Department', DepartmentSchema);
