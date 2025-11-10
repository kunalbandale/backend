import mongoose, { Document, Schema } from 'mongoose';

export interface SectionPDFDoc extends Document {
  filename: string;
  originalName: string;
  mobileNumber: string;
  department: string;
  uploadedBy: string; // User ID who uploaded
  uploadedByName: string; // User email/name
  pdfData: string; // Base64 encoded PDF data
  fileSize: number;
  mimeType: string;
  status: 'UPLOADED' | 'SENT' | 'FAILED';
  sentAt?: Date;
  sentBy?: string; // User ID who sent it
  sentByName?: string; // User email/name who sent it
  waMessageId?: string;
  error?: string;
}

const SectionPDFSchema = new Schema<SectionPDFDoc>(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    department: { type: String, required: true },
    uploadedBy: { type: String, required: true },
    uploadedByName: { type: String, required: true },
    pdfData: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['UPLOADED', 'SENT', 'FAILED'], 
      required: true, 
      default: 'UPLOADED' 
    },
    sentAt: { type: Date },
    sentBy: { type: String },
    sentByName: { type: String },
    waMessageId: { type: String },
    error: { type: String }
  },
  { timestamps: true }
);

// Index for better query performance
SectionPDFSchema.index({ department: 1, status: 1 });
SectionPDFSchema.index({ uploadedBy: 1 });
SectionPDFSchema.index({ mobileNumber: 1 });

export const SectionPDFModel = mongoose.model<SectionPDFDoc>('SectionPDF', SectionPDFSchema);






