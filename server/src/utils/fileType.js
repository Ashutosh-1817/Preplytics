

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const PDF_MIME = 'application/pdf';
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']; // no SVG: it can carry scripts

const DOCUMENT_EXTENSIONS = {
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};

export const resolveFileType = (mimeType) => {
  if (mimeType === PDF_MIME) return 'pdf';
  if (IMAGE_MIMES.includes(mimeType)) return 'image';
  if (Object.hasOwn(DOCUMENT_EXTENSIONS, mimeType)) return 'document';
  return null;
};

export const resolveCloudinaryResourceType = (fileType) => (fileType === 'image' ? 'image' : 'raw');

// Raw uploads keep their extension in the stored name, which is what
// lets the CDN serve them with a correct content type.
export const resolveRawExtension = (mimeType) =>
  mimeType === PDF_MIME ? '.pdf' : DOCUMENT_EXTENSIONS[mimeType] || '';