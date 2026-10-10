

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.txt';

export const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
};

export const formatShortDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const validateFileForUpload = (file) => {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return `"${file.name}" isn't a supported type. Use PDF, PNG, JPG, WebP, GIF, DOC, DOCX or TXT.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${formatFileSize(file.size)}. The limit is 10 MB.`;
  }
  return null;
};

// Cloudinary resizes on the fly when the transformation sits in the URL
export const thumbnailUrl = (url, width = 480, height = 300) =>
  url.replace('/upload/', `/upload/c_fill,w_${width},h_${height},q_auto,f_auto/`);

export const isStalePending = (file) =>
  file.extractionStatus === 'pending' && Date.now() - new Date(file.updatedAt).getTime() > 3 * 60 * 1000;

const FAILURES = {
  DELIVERY_BLOCKED: {
    short: 'Storage is blocking PDFs',
    hint: 'In Cloudinary, open Settings → Security and turn on "Allow delivery of PDF and ZIP files", then retry.',
    retryable: true,
  },
  NO_TEXT: {
    short: 'No selectable text',
    hint: "This looks like a scan or image-only PDF. You can read it here, but the AI can't.",
    retryable: false,
  },
  PASSWORD_PROTECTED: {
    short: 'Password protected',
    hint: 'Remove the password and upload it again.',
    retryable: false,
  },
  NOT_A_PDF: {
    short: 'Not a valid PDF',
    hint: "This file doesn't look like a real PDF.",
    retryable: false,
  },
};

const DEFAULT_FAILURE = {
  short: "Couldn't read text",
  hint: 'Something went wrong while reading this file. Try again.',
  retryable: true,
};

export const describeExtractionFailure = (code) => FAILURES[code] || DEFAULT_FAILURE;