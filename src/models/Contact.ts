import mongoose, { Schema, Document } from 'mongoose';

export interface ContactDoc extends Document {
  name: string;
  phone: string; // E.164
  tags?: string[];
}

const ContactSchema = new Schema<ContactDoc>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

export const ContactModel = mongoose.model<ContactDoc>('Contact', ContactSchema);


