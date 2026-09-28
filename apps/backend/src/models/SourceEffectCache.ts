import mongoose, { Document, Schema, Types } from "mongoose";

// Cached "Mogelijke effecten" (verbatim statements the ai-service extracts) for one
// source, so the source page and AI dashboard don't re-run the expensive extraction
// on every view. `specHash` fingerprints the exact findStatements input; when the
// project's specs change the hash no longer matches and the row is overwritten with
// freshly computed statements.
export interface ISourceEffectStatement {
	text: string;
	page: number | null;
}

export interface ISourceEffectCache extends Document {
	projectId: Types.ObjectId;
	docId: string;
	themeSlug: string | null;
	specHash: string;
	statements: ISourceEffectStatement[];
	createdAt: Date;
	updatedAt: Date;
}

const SourceEffectStatementSchema = new Schema<ISourceEffectStatement>(
	{
		text: { type: String, required: true },
		page: { type: Number, default: null },
	},
	{ _id: false }
);

const SourceEffectCacheSchema = new Schema<ISourceEffectCache>(
	{
		projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
		docId: { type: String, required: true },
		themeSlug: { type: String, default: null },
		specHash: { type: String, required: true },
		statements: { type: [SourceEffectStatementSchema], default: [] },
	},
	{ timestamps: true }
);

// One cache row per (project, source, theme): the upsert target and read key.
SourceEffectCacheSchema.index({ projectId: 1, docId: 1, themeSlug: 1 }, { unique: true });

export const SourceEffectCache =
	mongoose.models.SourceEffectCache ||
	mongoose.model<ISourceEffectCache>("SourceEffectCache", SourceEffectCacheSchema);
