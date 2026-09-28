import mongoose from 'mongoose';
import connectDB from '../lib/database';
import { Project } from '../models/Project';

type RepairMode = 'dry-run' | 'apply';

type UploadedDocumentRecord = {
  _id?: unknown;
  id?: unknown;
  name?: unknown;
  fileName?: unknown;
  blobPath?: unknown;
};

type ProjectRecord = {
  _id?: unknown;
  slug?: string;
  name?: string;
  uploadedDocuments?: UploadedDocumentRecord[];
};

const invalidUploadedDocumentFilter = {
  $or: [
    { blobPath: { $exists: false } },
    { blobPath: null },
    { blobPath: '' },
  ],
};

const projectFilter = {
  uploadedDocuments: {
    $elemMatch: invalidUploadedDocumentFilter,
  },
};

function printHelp() {
  console.info([
    'Repair uploaded document records with missing blobPath values.',
    '',
    'Usage:',
    '  pnpm --filter ./apps/backend repair:uploaded-documents -- --dry-run',
    '  pnpm --filter ./apps/backend repair:uploaded-documents -- --apply',
    '',
    'Options:',
    '  --dry-run  List invalid uploaded documents without changing data. This is the default.',
    '  --apply    Remove invalid uploaded document entries from matching projects.',
    '  --help     Show this help text.',
  ].join('\n'));
}

function parseMode(args: string[]): RepairMode | 'help' {
  if (args.includes('--help') || args.includes('-h')) {
    return 'help';
  }

  if (args.includes('--apply')) {
    return 'apply';
  }

  return 'dry-run';
}

function isInvalidUploadedDocument(document: UploadedDocumentRecord): boolean {
  return typeof document.blobPath !== 'string' || document.blobPath.trim().length === 0;
}

function toPrintableId(value: unknown): string {
  if (!value) {
    return 'unknown';
  }

  return String(value);
}

function summarizeInvalidDocuments(projects: ProjectRecord[]) {
  return projects.flatMap((project) => {
    const invalidDocuments = (project.uploadedDocuments ?? []).filter(isInvalidUploadedDocument);

    return invalidDocuments.map((document) => ({
      projectId: toPrintableId(project._id),
      projectSlug: project.slug ?? 'unknown',
      projectName: project.name ?? 'Unknown project',
      documentId: toPrintableId(document._id ?? document.id),
      documentName: String(document.name ?? document.fileName ?? 'Unknown document'),
    }));
  });
}

async function repairUploadedDocuments() {
  const mode = parseMode(process.argv.slice(2));

  if (mode === 'help') {
    printHelp();
    return;
  }

  try {
    await connectDB();

    const projects = await Project.find(projectFilter)
      .select('_id slug name uploadedDocuments')
      .lean<ProjectRecord[]>();

    const invalidDocuments = summarizeInvalidDocuments(projects);

    if (invalidDocuments.length === 0) {
      console.info('No uploaded documents with missing blobPath values found.');
      return;
    }

    console.info(`Found ${invalidDocuments.length} uploaded document(s) with missing blobPath values in ${projects.length} project(s).`);
    for (const document of invalidDocuments) {
      console.info([
        `- project=${document.projectSlug}`,
        `projectId=${document.projectId}`,
        `projectName="${document.projectName}"`,
        `documentId=${document.documentId}`,
        `documentName="${document.documentName}"`,
      ].join(' '));
    }

    if (mode === 'dry-run') {
      console.info('Dry run only. Re-run with --apply to remove these invalid uploaded document entries.');
      return;
    }

    const result = await Project.collection.updateMany(projectFilter as any, {
      $pull: {
        uploadedDocuments: invalidUploadedDocumentFilter,
      },
    } as any);

    console.info(`Removed invalid uploaded document entries. Matched projects: ${result.matchedCount}. Modified projects: ${result.modifiedCount}.`);
  } catch (error) {
    console.error('Failed to repair uploaded documents:', error);
    process.exitCode = 1;
  } finally {
    mongoose.connection.removeAllListeners('disconnected');
    await mongoose.disconnect();
  }
}

void repairUploadedDocuments();
