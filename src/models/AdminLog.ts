import mongoose, { Schema, Document } from 'mongoose';

export interface AdminLogDoc extends Document {
  action: string;
  type: 'ADD' | 'DELETE' | 'MODIFY' | 'SEND' | 'LOGIN' | 'LOGOUT';
  performedBy: string;
  performedById: string;
  details: string;
  targetType?: 'USER' | 'SECTION' | 'MESSAGE' | 'FILE' | 'SETTINGS';
  targetId?: string;
  metadata?: any;
  createdAt: Date;
}

const AdminLogSchema = new Schema<AdminLogDoc>(
  {
    action: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['ADD', 'DELETE', 'MODIFY', 'SEND', 'LOGIN', 'LOGOUT'], 
      required: true 
    },
    performedBy: { type: String, required: true }, // User's name/email
    performedById: { type: String, required: true }, // User's ID
    details: { type: String, required: true },
    targetType: { 
      type: String, 
      enum: ['USER', 'SECTION', 'MESSAGE', 'FILE', 'SETTINGS'],
      required: false 
    },
    targetId: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, required: false }
  },
  { timestamps: true }
);

// Indexes for efficient queries
AdminLogSchema.index({ createdAt: -1 });
AdminLogSchema.index({ performedById: 1, createdAt: -1 });
AdminLogSchema.index({ type: 1, createdAt: -1 });

export const AdminLogModel = mongoose.model<AdminLogDoc>('AdminLog', AdminLogSchema);
