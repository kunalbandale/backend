import mongoose, { Schema, Document, Types } from 'mongoose';

export interface BulkOperationDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  type: 'TEXT' | 'IMAGE' | 'DOCUMENT';
  messageContent: string; // For text messages
  mediaUrl?: string; // For image/document messages
  caption?: string; // For image/document messages
  department: string;
  totalRecipients: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  sentBy: Schema.Types.ObjectId;
  csvFileName?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

const BulkOperationSchema = new Schema<BulkOperationDoc>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['TEXT', 'IMAGE', 'DOCUMENT'], required: true },
    messageContent: { type: String },
    mediaUrl: { type: String },
    caption: { type: String },
    department: { type: String, required: true },
    totalRecipients: { type: Number, default: 0 },
    processedCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], 
      default: 'PENDING' 
    },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    csvFileName: { type: String },
    error: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes for efficient queries
BulkOperationSchema.index({ sentBy: 1, createdAt: -1 });
BulkOperationSchema.index({ status: 1, createdAt: -1 });
BulkOperationSchema.index({ department: 1, createdAt: -1 });

export const BulkOperationModel = mongoose.model<BulkOperationDoc>('BulkOperation', BulkOperationSchema);
