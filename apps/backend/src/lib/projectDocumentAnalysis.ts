import { Project } from '../models/Project';
import { defaultAiServiceClient, mapProjectToAiServiceInput, type AiServiceDocumentStatement } from './aiServiceClient';
import { logger } from './logger';

const trimOrUndefined = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const mapUploadedDocumentStatements = (statements: AiServiceDocumentStatement[] = []) =>
  statements
    .map((statement) => {
      const text = trimOrUndefined(statement.text);
      if (!text) return null;

      return {
        text,
        docId: trimOrUndefined(statement.doc_id),
        title: trimOrUndefined(statement.title),
        url: trimOrUndefined(statement.url),
        author: trimOrUndefined(statement.author),
        page: typeof statement.page === 'number' ? statement.page : undefined,
        score: typeof statement.score === 'number' ? statement.score : undefined,
        source: trimOrUndefined(statement.source) ?? 'upload',
      };
    })
    .filter(Boolean);

export const runUploadedDocumentAnalysis = async ({
  projectId,
  documentId,
  themeName,
  blobPath,
  fileName,
}: {
  projectId: string;
  documentId: string;
  themeName: string;
  blobPath: string;
  fileName: string;
}) => {
  try {
    const project = await Project.findById(projectId);
    if (!project) {
      logger.error('Uploaded document analysis skipped because project was not found', {
        projectId,
        documentId,
        blobPath,
      });
      return;
    }

    const uploadedDocument = (project as any).uploadedDocuments.id(documentId);
    if (!uploadedDocument) {
      logger.error('Uploaded document analysis skipped because document was not found', {
        projectId,
        documentId,
        blobPath,
      });
      return;
    }

    // Runs in the backend process (fire-and-forget from the upload route),
    // calling the ai-service /bw/analyze-document. Logged so the document
    // analysis lifecycle is visible in the backend output.
    logger.info('Uploaded document analysis started', {
      projectId,
      documentId,
      fileName,
      themeName,
    });

    const analysis = await defaultAiServiceClient.analyzeDocument({
      input: mapProjectToAiServiceInput(project, themeName),
      blob_path: blobPath,
      filename: fileName,
    });
    const generatedTitle = trimOrUndefined(analysis.summary?.title);
    const generatedDescription = trimOrUndefined(analysis.summary?.summary);

    uploadedDocument.aiTitle = generatedTitle;
    uploadedDocument.aiDescription = generatedDescription;
    uploadedDocument.aiStatements = mapUploadedDocumentStatements(analysis.statements ?? []);
    uploadedDocument.analysisStatus = 'COMPLETED';
    uploadedDocument.analysisError = undefined;

    if (generatedTitle) {
      uploadedDocument.name = generatedTitle;
    }
    if (generatedDescription) {
      uploadedDocument.description = generatedDescription;
    }

    await project.save();

    logger.info('Uploaded document analysis completed', {
      projectId,
      documentId,
      status: uploadedDocument.analysisStatus,
      statements: uploadedDocument.aiStatements?.length ?? 0,
    });
  } catch (analysisError) {
    logger.error('Uploaded document analysis failed', {
      projectId,
      documentId,
      blobPath,
      error: analysisError instanceof Error ? analysisError.message : analysisError,
    });

    try {
      const project = await Project.findById(projectId);
      const uploadedDocument = (project as any)?.uploadedDocuments?.id(documentId);
      if (!project || !uploadedDocument) {
        return;
      }

      uploadedDocument.analysisStatus = 'FAILED';
      uploadedDocument.analysisError = 'De AI-analyse van dit document is niet gelukt. Probeer het later opnieuw.';
      await project.save();
    } catch (statusError) {
      logger.error('Uploaded document analysis failure status could not be saved', {
        projectId,
        documentId,
        blobPath,
        error: statusError instanceof Error ? statusError.message : statusError,
      });
    }
  }
};
