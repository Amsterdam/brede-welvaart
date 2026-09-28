import { ArgumentImportance, ArgumentTimeFrame, ArgumentLocation, ArgumentSourceType, ArgumentSentiment } from '@shared/types';
import { Schema } from 'mongoose';

export const argumentSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    minlength: [1, 'Title cannot be empty'],
    validate: {
      validator: function(v: string) {
        return !!(v && v.trim().length > 0);
      },
      message: 'Title cannot be empty or contain only whitespace'
    }
  },
  explanation: {
    type: String,
    required: [true, 'Explanation is required'],
    trim: true,
    minlength: [1, 'Explanation cannot be empty'],
    validate: {
      validator: function(v: string) {
        return !!(v && v.trim().length > 0);
      },
      message: 'Explanation cannot be empty or contain only whitespace'
    }
  },
  order: {
    type: Number,
  },
  importance: {
    type: String,
    required: true,
    enum: [ArgumentImportance.High, ArgumentImportance.Medium, ArgumentImportance.Low],
    default: ArgumentImportance.Low,
  },
  timeFrame: [{
    type: String,
    required: true,
    enum: [
      ArgumentTimeFrame.Now,
      ArgumentTimeFrame.OneToFiveY,
      ArgumentTimeFrame.FiveToTenY,
      ArgumentTimeFrame.TenToTwentyY,
      ArgumentTimeFrame.TwentyToFortyY,
      ArgumentTimeFrame.FortyPlusY
    ],
  }],
  location: [{
    type: String,
    required: true,
    enum: [
      ArgumentLocation.Street,
      ArgumentLocation.Neighborhood,
      ArgumentLocation.City,
      ArgumentLocation.CityDistrict,
      ArgumentLocation.Province,
      ArgumentLocation.InsideEu,
      ArgumentLocation.OutsideEu
    ],
  }],
  source: {
    type: {
      type: String,
      required: [true, 'Source type is required'],
      enum: {
        values: [
          ArgumentSourceType.Data,
          ArgumentSourceType.Expert,
          ArgumentSourceType.Link,
          ArgumentSourceType.Policy,
          ArgumentSourceType.Resident
        ],
        message: 'Source type must be one of: DATA, EXPERT, LINK, POLICY, RESIDENT'
      }
    },
    link: {
      type: String,
      required: false,
      trim: true,
      validate: {
        validator: function (v: string | null | undefined) {
          if (!v || v.trim() === '') return true;
          // Decode URI-encoded links (frontend encodes with encodeURIComponent for WAF)
          let decoded: string;
          try {
            decoded = decodeURIComponent(v);
          } catch {
            return false;
          }
          return /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/i.test(decoded);
        },
        message: 'Link must be a valid URL if provided',
      },
    }
  },
  sourceEffect: {
    key: {
      type: String,
      required: false,
      trim: true,
    },
    sourceKind: {
      type: String,
      required: false,
      enum: ['OPEN_RESEARCH', 'UPLOADED_DOCUMENT'],
    },
    sourceId: {
      type: String,
      required: false,
      trim: true,
    },
    effectId: {
      type: String,
      required: false,
      trim: true,
    },
    themeSlug: {
      type: String,
      required: false,
      trim: true,
    },
    page: {
      type: Number,
      required: false,
    },
    text: {
      type: String,
      required: false,
      trim: true,
    },
  },
  generatedByAi: {
    type: Boolean,
    required: true,
    default: false,
  },
  aiProposal: {
    type: String,
    required: false,
    trim: true,
  },
  // Display title of the originating source (e.g. the OpenResearch article),
  // carried over from the AI draft so the effect's source stays labelled and
  // linkable after conversion.
  sourceTitle: {
    type: String,
    required: false,
    trim: true,
  },
  sentiment: {
    type: String,
    required: true,
    enum: [ArgumentSentiment.Positive, ArgumentSentiment.Negative, ArgumentSentiment.Neutral],
    default: ArgumentSentiment.Neutral,
  },
  discussionPoint: {
    type: Boolean,
    required: true,
    default: false,
  },
}, {
  timestamps: true
});

// Middleware to add order property if missing
