import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import type { Readable } from 'stream';
import config from '../config';

const FALLBACK_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'application/rtf': '.rtf',
};

let cachedContainerClient: ContainerClient | null = null;

export const getContainerClient = () => {
  if (cachedContainerClient) {
    return cachedContainerClient;
  }

  if (!config.storage.connectionString) {
    if (!config.storage.accountUrl) {
      throw new Error(
        'AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_BLOB_ENDPOINT is required for document uploads.'
      );
    }

    const blobServiceClient = new BlobServiceClient(
      config.storage.accountUrl,
      new DefaultAzureCredential()
    );
    cachedContainerClient = blobServiceClient.getContainerClient(config.storage.containerName);
    return cachedContainerClient;
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(config.storage.connectionString);
  cachedContainerClient = blobServiceClient.getContainerClient(config.storage.containerName);
  return cachedContainerClient;
};

const assertStorageId = (name: string, value: string) => {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error(`Invalid ${name} for document storage path.`);
  }
};

const getOriginalFileExtension = (fileName: string, mimeType?: string) => {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
  if (/^\.[a-z0-9]{1,10}$/.test(extension)) {
    return extension;
  }
  return mimeType ? FALLBACK_EXTENSION_BY_MIME_TYPE[mimeType.toLowerCase()] ?? '' : '';
};

export const buildProjectDocumentBlobPath = (
  projectId: string,
  documentId: string,
  fileName: string,
  mimeType?: string
) => {
  assertStorageId('projectId', projectId);
  assertStorageId('documentId', documentId);
  return `uploads/${projectId}/documents/${documentId}/original${getOriginalFileExtension(fileName, mimeType)}`;
};

export const uploadProjectDocumentBlob = async ({
  blobPath,
  content,
  mimeType,
}: {
  blobPath: string;
  content: Buffer;
  mimeType?: string;
}) => {
  const containerClient = getContainerClient();
  await containerClient.createIfNotExists();

  const blobClient = containerClient.getBlockBlobClient(blobPath);
  await blobClient.uploadData(content, {
    blobHTTPHeaders: {
      blobContentType: mimeType || 'application/octet-stream',
    },
  });
};

export const uploadProjectDocumentBlobStream = async ({
  blobPath,
  content,
  mimeType,
}: {
  blobPath: string;
  content: Readable;
  mimeType?: string;
}) => {
  const containerClient = getContainerClient();
  await containerClient.createIfNotExists();

  const blobClient = containerClient.getBlockBlobClient(blobPath);
  await blobClient.uploadStream(content, 4 * 1024 * 1024, 5, {
    blobHTTPHeaders: {
      blobContentType: mimeType || 'application/octet-stream',
    },
  });
};

export const deleteProjectDocumentBlob = async (blobPath: string) => {
  const containerClient = getContainerClient();
  const blobClient = containerClient.getBlockBlobClient(blobPath);
  await blobClient.deleteIfExists();
};
