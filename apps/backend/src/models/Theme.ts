import mongoose, { Document, Schema } from 'mongoose';
import { IArgument, ITheme } from '@shared/types';
import { argumentSchema } from './Argument';
import slugify from 'slugify';

const MAX_ARGUMENTS = 10;
const MAX_ARGUMENTS_PER_SENTIMENT = 5;

export const themeSchema = new Schema({
  slug: {
    type: String,
    immutable: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  arguments: {
    type: [argumentSchema],
    required: false,
    validate: [
      {
        validator: function (v: IArgument[]) {
          return Array.isArray(v) && v.length <= MAX_ARGUMENTS;
        },
        message: () => `The maximum number of arguments is ${MAX_ARGUMENTS}!`,
      },
      {
        validator: function (v: IArgument[]) {
          if (!Array.isArray(v)) return true;

          const positiveCount = v.filter(arg => arg.sentiment === 'POSITIVE').length;
          const negativeCount = v.filter(arg => arg.sentiment === 'NEGATIVE').length;

          return positiveCount <= MAX_ARGUMENTS_PER_SENTIMENT && negativeCount <= MAX_ARGUMENTS_PER_SENTIMENT;
        },
        message: () => `Maximaal ${MAX_ARGUMENTS_PER_SENTIMENT} argumenten per sentiment toegestaan!`,
      }
    ],
  }
}, {
  timestamps: true
});

// Middleware to generate slug from name before saving
themeSchema.pre('save', function() {
  // Only generate slug if name has changed or slug doesn't exist
  if (this.isModified('name') || !this.slug) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
      trim: true,
      // Dutch charmap so 'Milieu & Natuurlijk kapitaal' → 'milieu-en-natuurlijk-kapitaal', not '-and-'
      locale: 'nl'
    });
  }
});
