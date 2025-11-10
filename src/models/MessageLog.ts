import mongoose, { Schema, Document } from 'mongoose';

export interface MessageLogDoc extends Document {
  to: string;
  type: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'TEMPLATE';
  templateName?: string;
  payload: any;
  waMessageId?: string;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'DELIVERED' | 'READ' | 'UPLOADED';
  department?: string;
  sentBy?: Schema.Types.ObjectId;
  error?: string;
  retryCount: number;
  lastRetryAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  cost?: number; // For tracking costs if applicable
  updateStatus: (
    newStatus: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
    error?: string
  ) => Promise<this>;
}

const MessageLogSchema = new Schema<MessageLogDoc>(
  {
    to: { type: String, required: true },
    type: { type: String, enum: ['TEXT', 'IMAGE', 'DOCUMENT', 'TEMPLATE'], required: true },
    templateName: { type: String },
    payload: { type: Schema.Types.Mixed },
    waMessageId: { type: String },
    status: { 
      type: String, 
      enum: ['QUEUED', 'SENT', 'FAILED', 'DELIVERED', 'READ', 'UPLOADED'], 
      required: true, 
      default: 'QUEUED'
    },
    department: { type: String },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    lastRetryAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    cost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for efficient queries
MessageLogSchema.index({ createdAt: -1 });
MessageLogSchema.index({ type: 1, status: 1, department: 1, createdAt: -1 });
MessageLogSchema.index({ waMessageId: 1 });
MessageLogSchema.index({ to: 1, createdAt: -1 });
MessageLogSchema.index({ sentBy: 1, createdAt: -1 });
MessageLogSchema.index({ status: 1, retryCount: 1 });

// Method to update message status
MessageLogSchema.methods.updateStatus = async function(newStatus: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED', error?: string) {
  this.status = newStatus;
  
  if (newStatus === 'DELIVERED') {
    this.deliveredAt = new Date();
  } else if (newStatus === 'READ') {
    this.readAt = new Date();
  } else if (newStatus === 'FAILED' && error) {
    this.error = error;
    this.retryCount += 1;
    this.lastRetryAt = new Date();
  }
  
  return await this.save();
};

export const MessageLogModel = mongoose.model<MessageLogDoc>('MessageLog', MessageLogSchema);


