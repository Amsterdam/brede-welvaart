import mongoose, { Document, Schema, Types } from "mongoose";

export interface ICommentReadState extends Document {
	userId: Types.ObjectId;
	commentId: Types.ObjectId;
	projectId: Types.ObjectId;
	lastReadAt: Date;
}

const CommentReadStateSchema = new Schema<ICommentReadState>(
	{
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		commentId: { type: Schema.Types.ObjectId, ref: "Comment", required: true },
		projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
		lastReadAt: { type: Date, required: true },
	},
	{ timestamps: false }
);

// Unique compound index for upsert operations
CommentReadStateSchema.index({ userId: 1, commentId: 1 }, { unique: true });
// Bulk fetch per project
CommentReadStateSchema.index({ userId: 1, projectId: 1 });
// Cascade delete on comment removal
CommentReadStateSchema.index({ commentId: 1 });

export const CommentReadState =
	mongoose.models.CommentReadState ||
	mongoose.model<ICommentReadState>("CommentReadState", CommentReadStateSchema);
