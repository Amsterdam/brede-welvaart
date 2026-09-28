import Busboy from 'busboy';
import type { Request, Response } from 'express';
import { GraphQLError } from 'graphql';
import mongoose from 'mongoose';
import { Transform } from 'node:stream';
import { createContext } from '../lib/context';
import { logger } from '../lib/logger';
import { AuthenticationError, NotFoundError } from '../lib/errors';
import { mapMongoToGraphQL } from '../lib/mongoMapper';
import { requireProjectOwner } from '../lib/permissions';
import { runUploadedDocumentAnalysis } from '../lib/projectDocumentAnalysis';
import {
  buildProjectDocumentBlobPath,
  deleteProjectDocumentBlob,
  uploadProjectDocumentBlobStream,
} from '../lib/projectDocumentStorage';
import { Project } from '../models/Project';

export const MAX_PROJECT_DOCUMENT_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;
export const projectDocumentUploadRateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  message: {
    errors: [{ message: 'Te veel uploadpogingen. Probeer het later opnieuw.' }],
  },
};

const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.rtf']);
const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/rtf',
]);

class UploadHttpError extends Error {
  status: number;
  field?: string;

  constructor(message: string, status = 400, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

type UploadFields = Record<string, string>;

type UploadedFile = {
  documentId: mongoose.Types.ObjectId;
  blobPath: string;
  fileName: string;
  mimeType?: string;
  size: number;
  limitExceeded: boolean;
};

const trimOrUndefined = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const getFileExtension = (fileName: string) => {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : fileName.slice(lastDotIndex).toLowerCase();
};

const getFileNameWithoutExtension = (fileName: string) =>
  fileName.replace(/\.[^.]+$/, '');

const normalizeUploadFileName = (fileName: string) =>
  fileName.replace(/[\\/\0]/g, '').trim().slice(0, 255);

const isSupportedDocument = (fileName: string, mimeType?: string) => {
  const extension = getFileExtension(fileName);
  const normalizedMimeType = mimeType?.toLowerCase();
  return (
    SUPPORTED_DOCUMENT_EXTENSIONS.has(extension) ||
    (normalizedMimeType ? SUPPORTED_DOCUMENT_MIME_TYPES.has(normalizedMimeType) : false)
  );
};

const getRequiredField = (fields: UploadFields, field: string, message: string) => {
  const value = trimOrUndefined(fields[field]);
  if (!value) {
    throw new UploadHttpError(message, 400, field);
  }
  return value;
};

const cleanupBlob = async (blobPath: string) => {
  try {
    await deleteProjectDocumentBlob(blobPath);
  } catch {
    // Keep the original upload error as the response; cleanup can be retried operationally.
  }
};

const parseMultipartUpload = async (
  req: Request,
  projectId: string,
  maxFileSizeBytes: number
): Promise<{ fields: UploadFields; file: UploadedFile }> => {
  const fields: UploadFields = {};
  const uploadPromises: Promise<void>[] = [];
  const state: { uploadedFile?: UploadedFile } = {};
  let parseError: UploadHttpError | null = null;

  let busboy: ReturnType<typeof Busboy>;
  try {
    busboy = Busboy({
      headers: req.headers,
      limits: {
        fieldNameSize: 100,
        fieldSize: 2048,
        fields: 8,
        fileSize: maxFileSizeBytes,
        files: 1,
        parts: 9,
        headerPairs: 2000,
      },
    });
  } catch {
    throw new UploadHttpError('Verstuur het bestand als formulier-upload.', 415);
  }

  busboy.on('field', (name, value, info) => {
    if (info.valueTruncated || info.nameTruncated) {
      parseError ??= new UploadHttpError('Een veld in het uploadformulier is te lang.', 400, name);
      return;
    }
    fields[name] = value;
  });

  busboy.on('file', (fieldName, file, info) => {
    if (fieldName !== 'file') {
      parseError ??= new UploadHttpError('Gebruik het veld "file" voor het bestand.', 400, 'file');
      file.resume();
      return;
    }

    if (state.uploadedFile) {
      parseError ??= new UploadHttpError('Upload één document per keer.', 400, 'file');
      file.resume();
      return;
    }

    const fileName = normalizeUploadFileName(info.filename || '');
    const mimeType = trimOrUndefined(info.mimeType);
    if (!fileName) {
      parseError ??= new UploadHttpError('Kies een bestand.', 400, 'file');
      file.resume();
      return;
    }
    if (!isSupportedDocument(fileName, mimeType)) {
      parseError ??= new UploadHttpError('Upload een pdf, Word-document, tekstbestand of rtf-bestand.', 400, 'file');
      file.resume();
      return;
    }

    const documentId = new mongoose.Types.ObjectId();
    const blobPath = buildProjectDocumentBlobPath(projectId, documentId.toString(), fileName, mimeType);
    state.uploadedFile = {
      documentId,
      blobPath,
      fileName,
      mimeType,
      size: 0,
      limitExceeded: false,
    };

    // Count bytes via a pass-through Transform rather than a `file.on('data')`
    // listener. A raw data listener switches the busboy file stream to flowing
    // mode immediately; it then drains during the `await` inside the blob
    // upload (e.g. createIfNotExists), so uploadStream attaches to an
    // already-ended stream and waits forever for an 'end' that already fired.
    // A Transform buffers with backpressure, so uploadStream receives the full
    // stream including its end.
    const sizeCounter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        if (state.uploadedFile) {
          state.uploadedFile.size += chunk.length;
        }
        callback(null, chunk);
      },
    });

    file.on('limit', () => {
      if (state.uploadedFile) {
        state.uploadedFile.limitExceeded = true;
      }
    });

    file.on('error', (error: Error) => {
      parseError ??= new UploadHttpError('Het bestand kon niet worden gelezen.', 400, 'file');
      sizeCounter.destroy(error);
    });

    file.pipe(sizeCounter);

    uploadPromises.push(
      uploadProjectDocumentBlobStream({
        blobPath,
        content: sizeCounter,
        mimeType,
      })
    );
  });

  busboy.on('filesLimit', () => {
    parseError ??= new UploadHttpError('Upload één document per keer.', 400, 'file');
  });
  busboy.on('fieldsLimit', () => {
    parseError ??= new UploadHttpError('Het uploadformulier bevat te veel velden.', 400);
  });
  busboy.on('partsLimit', () => {
    parseError ??= new UploadHttpError('Het uploadformulier bevat te veel onderdelen.', 400);
  });

  await new Promise<void>((resolve, reject) => {
    busboy.on('error', reject);
    busboy.on('close', resolve);
    req.pipe(busboy);
  });

  const uploadResults = await Promise.allSettled(uploadPromises);
  const uploadFailure = uploadResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );

  const uploadedFile = state.uploadedFile;
  if (!uploadedFile) {
    throw parseError ?? new UploadHttpError('Kies een bestand.', 400, 'file');
  }

  const fileWasTruncated = uploadedFile.limitExceeded;
  if (parseError || fileWasTruncated) {
    await cleanupBlob(uploadedFile.blobPath);
    if (fileWasTruncated) {
      throw new UploadHttpError('Het bestand mag maximaal 100 MB zijn.', 413, 'file');
    }
    throw parseError;
  }

  if (uploadFailure) {
    logger.error('Project document blob upload failed', {
      blobPath: uploadedFile.blobPath,
      reason: uploadFailure.reason instanceof Error ? uploadFailure.reason.message : String(uploadFailure.reason),
    });
    await cleanupBlob(uploadedFile.blobPath);
    throw new UploadHttpError('Het bestand kon niet worden opgeslagen.', 500, 'file');
  }

  if (uploadedFile.size <= 0) {
    await cleanupBlob(uploadedFile.blobPath);
    throw new UploadHttpError('Het bestand is leeg of ongeldig.', 400, 'file');
  }

  return { fields, file: uploadedFile };
};

const sendError = (res: Response, error: unknown) => {
  if (error instanceof UploadHttpError) {
    return res.status(error.status).json({
      errors: [
        {
          message: error.message,
          ...(error.field ? { field: error.field } : {}),
        },
      ],
    });
  }

  if (error instanceof GraphQLError) {
    const status = (error.extensions?.http as { status?: number } | undefined)?.status ?? 500;
    return res.status(status).json({ errors: [{ message: error.message }] });
  }

  return res.status(500).json({ errors: [{ message: 'Het document kon niet worden geüpload.' }] });
};

export const createProjectDocumentUploadHandler = ({
  maxFileSizeBytes = MAX_PROJECT_DOCUMENT_UPLOAD_SIZE_BYTES,
}: {
  maxFileSizeBytes?: number;
} = {}) => async (req: Request, res: Response) => {
  let blobPathToCleanup: string | null = null;

  try {
    const context = await createContext({ req });
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    const projectId = String(req.params.projectId ?? '');
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw new NotFoundError('Project');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    requireProjectOwner(project, context, 'upload documents to');

    const { fields, file } = await parseMultipartUpload(req, project._id.toString(), maxFileSizeBytes);
    blobPathToCleanup = file.blobPath;

    const themeSlug = getRequiredField(fields, 'themeSlug', 'Dit thema bestaat niet in deze scan.');
    const theme = (project as any).themes?.find((item: any) => item.slug === themeSlug);
    if (!theme) {
      throw new UploadHttpError('Dit thema bestaat niet in deze scan.', 400, 'themeSlug');
    }

    const name = trimOrUndefined(fields.name) ?? getFileNameWithoutExtension(file.fileName);
    const description = trimOrUndefined(fields.description);
    const keyword = trimOrUndefined(fields.keyword);

    (project as any).uploadedDocuments.push({
      _id: file.documentId,
      themeSlug,
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
      name,
      description,
      keyword,
      blobPath: file.blobPath,
      analysisStatus: 'RUNNING',
      uploadedBy: context.user?._id,
      aiStatements: [],
    });

    await project.save();
    blobPathToCleanup = null;

    void runUploadedDocumentAnalysis({
      projectId: project._id.toString(),
      documentId: file.documentId.toString(),
      themeName: theme.name,
      blobPath: file.blobPath,
      fileName: file.fileName,
    });

    const uploadedDocument = (project as any).uploadedDocuments.id(file.documentId);
    return res.status(201).json({ data: mapMongoToGraphQL(uploadedDocument) });
  } catch (error) {
    if (blobPathToCleanup) {
      await cleanupBlob(blobPathToCleanup);
    }
    return sendError(res, error);
  }
};
