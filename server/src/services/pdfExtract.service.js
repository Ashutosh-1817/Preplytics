
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_FILE_BYTES } from '../utils/fileType.js';

const MAX_PAGES = 500;
const MAX_TOTAL_CHARS = 1_500_000;
const MIN_TOTAL_CHARS = 20;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export class ExtractionError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
    this.meta = meta;
  }
}

const cleanPageText = (items) =>
  items
    .filter((item) => typeof item.str === 'string')
    .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const downloadPdf = async (url) => {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (err) {
    throw new ExtractionError('DOWNLOAD_FAILED', `Could not download the file: ${err.message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ExtractionError(
      'DELIVERY_BLOCKED',
      'Cloudinary refused to deliver this PDF. Enable "Allow delivery of PDF and ZIP files" in Settings → Security.'
    );
  }
  if (!response.ok) {
    throw new ExtractionError('DOWNLOAD_FAILED', `Storage returned status ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_FILE_BYTES) {
    throw new ExtractionError('PARSE_FAILED', 'File is larger than the allowed limit.');
  }
  // The PDF header may sit within the first KB, so don't require byte 0
  if (buffer.subarray(0, 1024).indexOf('%PDF-') === -1) {
    throw new ExtractionError('NOT_A_PDF', 'This file is not a valid PDF.');
  }

  return buffer;
};

export const extractPdfPages = async (buffer) => {
  // destroy() lives on the loading task, not on the document it resolves to
  const loadingTask = getDocument({
    data: new Uint8Array(buffer), // copy: pdf.js takes ownership of the memory
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  });

  // Cleanup must never mask the real outcome, so its own failures are swallowed
  const release = async () => {
    try {
      await loadingTask.destroy();
    } catch {
      // nothing useful to do
    }
  };

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    await release();
    if (err?.name === 'PasswordException') {
      throw new ExtractionError('PASSWORD_PROTECTED', 'This PDF is password protected.');
    }
    throw new ExtractionError('PARSE_FAILED', `Could not open the PDF: ${err.message}`);
  }

  try {
    const pageCount = pdf.numPages;
    const limit = Math.min(pageCount, MAX_PAGES);
    const pages = [];
    let totalChars = 0;

    for (let i = 1; i <= limit; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      page.cleanup();

      const text = cleanPageText(content.items);
      pages.push(text);
      totalChars += text.length;
      if (totalChars >= MAX_TOTAL_CHARS) break;
    }

    if (pages.join('').trim().length < MIN_TOTAL_CHARS) {
      throw new ExtractionError('NO_TEXT', 'No selectable text found. This may be a scanned PDF.', { pageCount });
    }

    return { pages, pageCount };
  } finally {
    await release();
  }
};

export const extractPdfFromUrl = async (url) => extractPdfPages(await downloadPdf(url));