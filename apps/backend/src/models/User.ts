import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from '@shared/types';

interface UserDocument extends IUser, Document {}

const userSchema = new Schema({
  entraId: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  displayName: {
    type: String,
    required: true,
  }
}, {
  timestamps: true
});

export const User = mongoose.model<UserDocument>('User', userSchema);
