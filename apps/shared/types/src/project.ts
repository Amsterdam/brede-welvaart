import { ITheme } from './theme';
import { IUser } from './user';
import { IArgumentSource, IArgumentSourceEffect } from './argument';

export type ProjectUserRole = 'OWNER' | 'REVIEWER';
export type ProjectReasonValue = 'COUNCIL_LETTER' | 'NEW_POLICY' | 'PROJECT_PROPOSAL' | 'OTHER';
export type ProjectAiAnalysisStatusValue = 'NOT_STARTED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ProjectUploadedDocumentAnalysisStatusValue = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface IProjectUser {
  user: string | IUser;  // ObjectId string or populated user
  role: ProjectUserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProject {
  id?: string;  // MongoDB ObjectId as string
  name: string;
  description: string;
  reason: ProjectReasonValue[];
  reasonOther?: string;
  scanGoal?: string;
  impactSituation?: string;
  impactMotivation?: string;
  scope?: string;
  additionalContext?: string;
  status: string;
  template?: string;  // ThemeTemplateEnum value; absent on scans created before v1.1
  createdBy: string;  // This will be the ObjectId string
  themes: ITheme[];
  users: IProjectUser[];
  shareLink?: string;
  keyMessage?: string;
  aiAnalysis?: IProjectAiAnalysis;
  uploadedDocuments?: IProjectUploadedDocument[];
  aiDraftEffects?: IProjectAiDraftEffect[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IProjectUploadedDocument {
  id?: string;
  themeSlug: string;
  fileName: string;
  mimeType?: string;
  size: number;
  name: string;
  description?: string;
  keyword?: string;
  blobPath: string;
  analysisStatus: ProjectUploadedDocumentAnalysisStatusValue;
  analysisError?: string;
  aiTitle?: string;
  aiDescription?: string;
  aiStatements: IProjectUploadedDocumentStatement[];
  uploadedAt: Date;
  uploadedBy?: string;
}

export interface IProjectUploadedDocumentStatement {
  text: string;
  docId?: string;
  title?: string;
  url?: string;
  author?: string;
  page?: number;
  score?: number;
  source: string;
}

export interface IProjectAiDraftEffect {
  id?: string;
  themeSlug?: string;
  title: string;
  explanation: string;
  sentiment: string;
  discussionPoint: boolean;
  timeFrame: string[];
  location: string[];
  source: IArgumentSource;
  sourceTitle?: string;
  sourceEffect: IArgumentSourceEffect;
  generatedByAi: boolean;
  aiProposal?: string;
  importance: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IProjectAiAnalysis {
  status: ProjectAiAnalysisStatusValue;
  generatedQuestion?: string;
  inputSummary?: string;
  methodExplanation?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  experts: IProjectAiExpert[];
  sources: IProjectAiSource[];
  talkingPoints: IProjectAiTalkingPoint[];
  themes: IProjectAiTheme[];
}

export interface IProjectAiExpert {
  externalId?: string;
  name?: string;
  organisation?: string;
  description?: string;
  score?: number;
  sourceIds: string[];
  metadata?: Record<string, unknown>;
}

export interface IProjectAiSource {
  externalId?: string;
  title?: string;
  content?: string;
  url?: string;
  score?: number;
  sourceType?: string;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface IProjectAiTalkingPoint {
  topic?: string;
  description?: string;
  themes: string[];
  supportingSourceIds: string[];
}

export interface IProjectAiTheme {
  slug?: string;
  name?: string;
  relevance?: number;
  rationale?: string;
  talkingPointIds: string[];
}
