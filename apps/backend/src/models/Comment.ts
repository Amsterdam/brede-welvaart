import mongoose, { Document, Schema, Types } from "mongoose";

/**
 * Interface for a reply (recursive, for nested replies)
 */
export interface IReply extends Document {
  author: Types.ObjectId;
  body: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for semantic anchor data
 */
export interface IAnchor {
  type: 'argument' | 'effect' | 'theme' | 'page';
  themeId?: Types.ObjectId;
  argumentId?: Types.ObjectId;
  effectIndex?: number;
  relativePosition?: { x: number; y: number };
}

/**
 * Interface for a top-level comment
 */
export interface IComment extends Document {
  projectId: Types.ObjectId;
  author: Types.ObjectId;
  body: string;
  replies: IReply[];
  resolved: boolean;
  page?: string;
  locationData?: any;
  anchor?: IAnchor;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReplySchema = new Schema<IReply>(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true, _id: true }
);

const AnchorSchema = new Schema<IAnchor>(
  {
    type: { type: String, enum: ['argument', 'effect', 'theme', 'page'], required: true },
    themeId: { type: Schema.Types.ObjectId, ref: "Theme" },
    argumentId: { type: Schema.Types.ObjectId, ref: "Argument" },
    effectIndex: { type: Number },
    relativePosition: {
      x: { type: Number },
      y: { type: Number }
    }
  },
  { _id: false }
);

const CommentSchema = new Schema<IComment>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
    replies: [ReplySchema],
    resolved: { type: Boolean, default: false },
    page: { type: String },
    locationData: { type: Schema.Types.Mixed },
    anchor: { type: AnchorSchema },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Comment = mongoose.models.Comment || mongoose.model<IComment>("Comment", CommentSchema);
