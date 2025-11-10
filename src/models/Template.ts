import mongoose, { Schema, Document } from 'mongoose';

export type TemplateType = 'TEXT' | 'IMAGE' | 'DOCUMENT';

export interface TemplateDoc extends Document {
  name: string; // internal name
  type: TemplateType;
  body?: string; // for TEXT; may include variables like {{1}}, {{2}}
  mediaUrl?: string; // for IMAGE/DOCUMENT
  caption?: string; // optional for image/doc
}

const TemplateSchema = new Schema<TemplateDoc>(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['TEXT', 'IMAGE', 'DOCUMENT'], required: true },
    body: { type: String },
    mediaUrl: { type: String },
    caption: { type: String },
  },
  { timestamps: true }
);

export const TemplateModel = mongoose.model<TemplateDoc>('Template', TemplateSchema);


