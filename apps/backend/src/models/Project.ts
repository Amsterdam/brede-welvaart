import mongoose, { Document, Schema } from 'mongoose';
import { IProject } from '@shared/types';
import { themeSchema } from './Theme';
import { ThemeTemplateEnum } from '../templates/themeTemplates';
import slugify from 'slugify';
import crypto from 'crypto';

type UserProjectRole = 'OWNER' | 'REVIEWER';
type ProjectReason = 'COUNCIL_LETTER' | 'NEW_POLICY' | 'PROJECT_PROPOSAL' | 'OTHER';
type ProjectAiAnalysisStatus = 'NOT_STARTED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
type ProjectUploadedDocumentAnalysisStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ProjectDocument extends Omit<IProject, 'id'>, Document {}

const projectAiExpertSchema = new Schema({
  externalId: String,
  name: String,
  organisation: String,
  description: String,
  score: Number,
  sourceIds: {
    type: [String],
    default: [],
  },
  metadata: Schema.Types.Mixed,
}, { _id: false });

const projectAiSourceSchema = new Schema({
  externalId: String,
  title: String,
  content: String,
  url: String,
  score: Number,
  sourceType: String,
  publishedAt: Date,
  metadata: Schema.Types.Mixed,
}, { _id: false });

const projectAiTalkingPointSchema = new Schema({
  topic: String,
  description: String,
  themes: {
    type: [String],
    default: [],
  },
  supportingSourceIds: {
    type: [String],
    default: [],
  },
}, { _id: false });

const projectAiThemeSchema = new Schema({
  slug: String,
  name: String,
  relevance: Number,
  rationale: String,
  talkingPointIds: {
    type: [String],
    default: [],
  },
}, { _id: false });

const projectAiProgressPhaseSchema = new Schema({
  key: String,
  status: {
    type: String,
    enum: ['PENDING', 'RUNNING', 'DONE'],
    default: 'PENDING',
  },
}, { _id: false });

const projectAiProgressSchema = new Schema({
  phases: {
    type: [projectAiProgressPhaseSchema],
    default: [],
  },
}, { _id: false });

const extendedAnalysisSchema = new Schema({
  themeSlug: {
    type: String,
    index: true,
  },
  searchQuestion: String,
  progress: projectAiProgressSchema,
  status: {
    type: String,
    enum: ['NOT_STARTED', 'RUNNING', 'COMPLETED', 'FAILED'] as ProjectAiAnalysisStatus[],
    default: 'NOT_STARTED',
  },
  generatedQuestion: String,
  inputSummary: String,
  methodExplanation: String,
  errorMessage: String,
  startedAt: Date,
  completedAt: Date,
  experts: {
    type: [projectAiExpertSchema],
    default: [],
  },
  sources: {
    type: [projectAiSourceSchema],
    default: [],
  },
  talkingPoints: {
    type: [projectAiTalkingPointSchema],
    default: [],
  },
  themes: {
    type: [projectAiThemeSchema],
    default: [],
  },
}, { _id: false });

const projectUploadedDocumentStatementSchema = new Schema({
  text: {
    type: String,
    required: true,
    trim: true,
  },
  docId: String,
  title: String,
  url: String,
  author: String,
  page: Number,
  score: Number,
  source: {
    type: String,
    default: 'upload',
  },
}, { _id: false });

const projectUploadedDocumentSchema = new Schema({
  themeSlug: {
    type: String,
    required: true,
    index: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  mimeType: String,
  size: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: String,
  keyword: String,
  blobPath: {
    type: String,
    required: true,
  },
  analysisStatus: {
    type: String,
    enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as ProjectUploadedDocumentAnalysisStatus[],
    default: 'PENDING',
  },
  analysisError: String,
  aiTitle: String,
  aiDescription: String,
  aiStatements: {
    type: [projectUploadedDocumentStatementSchema],
    default: [],
  },
  uploadedAt: {
    type: Date,
    default: () => new Date(),
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: false });

const projectAiDraftEffectSchema = new Schema({
  // Drafts are project-level (themeless); the theme is chosen when a draft is
  // converted into an argument. Kept optional for backward-compat with old data.
  themeSlug: {
    type: String,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  explanation: {
    type: String,
    required: true,
    trim: true,
  },
  sentiment: {
    type: String,
    required: true,
  },
  discussionPoint: {
    type: Boolean,
    required: true,
    default: false,
  },
  timeFrame: {
    type: [String],
    default: [],
  },
  location: {
    type: [String],
    default: [],
  },
  source: {
    type: {
      type: String,
      required: true,
    },
    link: String,
  },
  sourceTitle: {
    type: String,
    required: false,
    trim: true,
  },
  sourceEffect: {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    sourceKind: {
      type: String,
      required: true,
      enum: ['OPEN_RESEARCH', 'UPLOADED_DOCUMENT'],
    },
    sourceId: {
      type: String,
      required: true,
      trim: true,
    },
    effectId: {
      type: String,
      required: true,
      trim: true,
    },
    themeSlug: {
      type: String,
      trim: true,
    },
    page: Number,
    text: {
      type: String,
      required: false,
      trim: true,
    },
  },
  generatedByAi: {
    type: Boolean,
    required: true,
    default: true,
  },
  aiProposal: String,
  importance: {
    type: String,
    required: true,
    default: 'LOW',
  },
  // Set when the draft is converted into a real effect. The draft is kept (for
  // AI-dashboard "used" tracking) but the to-do list hides it on this marker
  // instead of a sourceEffect-key string match.
  convertedArgumentId: {
    type: Schema.Types.ObjectId,
  },
}, { timestamps: true });

const projectUserSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['OWNER', 'REVIEWER'] as UserProjectRole[],
    required: true
  }
}, {
  timestamps: true
});

const projectSchema = new Schema({
  slug: {
    type: String,
    immutable: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
    maxLength: 740,
  },
  reason: {
    type: [String],
    enum: ['COUNCIL_LETTER', 'NEW_POLICY', 'PROJECT_PROPOSAL', 'OTHER'] as ProjectReason[],
    default: [],
  },
  reasonOther: {
    type: String,
    required: false,
  },
  scanGoal: {
    type: String,
    required: false,
  },
  impactSituation: {
    type: String,
    required: false,
  },
  impactMotivation: {
    type: String,
    required: false,
  },
  scope: {
    type: String,
    required: false,
  },
  additionalContext: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    required: true,
  },
  // Theme-template version used at creation. Older scans predate this field;
  // the default makes them resolve to the original template without a migration.
  template: {
    type: String,
    enum: Object.values(ThemeTemplateEnum),
    default: ThemeTemplateEnum.DEFAULT,
    immutable: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  themes: {
    type: [themeSchema],
    required: false,
  },
  keyMessage: {
    type: String,
    required: false,
  },
  coverText: {
    type: String,
    required: false,
    maxLength: 2500,
  },
  users: [projectUserSchema],
  shareLink: {
    type: String,
    immutable: true,
  },
  aiAnalyses: {
    type: [extendedAnalysisSchema],
    default: [],
  },
  uploadedDocuments: {
    type: [projectUploadedDocumentSchema],
    default: [],
  },
  aiDraftEffects: {
    type: [projectAiDraftEffectSchema],
    default: [],
  },
}, {
  timestamps: true
});

// Middleware to generate slug from name before saving
projectSchema.pre('save', async function() {
  // Generate slug if name is modified or slug doesn't exist
  if (this.isModified('name') || !this.slug) {
    const baseSlug = slugify(this.name, {
      lower: true,
      strict: true,
      trim: true
    });

    // Check if slug exists and find the next available one
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existingProject = await Project.findOne({ slug, _id: { $ne: this._id } });
      if (!existingProject) {
        break;
      }
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    this.slug = slug;
  }

  // Generate shareLink only on creation
  if (this.isNew) {
    this.shareLink = crypto.randomBytes(32).toString('hex');
  }

});


export const Project = mongoose.models.Project || mongoose.model<ProjectDocument>('Project', projectSchema);
