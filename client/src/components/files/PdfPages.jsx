

import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

function PdfPages({ url, page, width, onLoaded, onError }) {
  return (
    <Document
      file={url}
      loading={null}
      error={null}
      noData={null}
      onLoadSuccess={({ numPages }) => onLoaded(numPages)}
      onLoadError={(err) => onError(err?.message || 'Could not open this PDF.')}
    >
      <Page
        className="pdf-page"
        pageNumber={page}
        width={width}
        renderAnnotationLayer={false}
        loading={<div className="fv-skeleton" style={{ width, height: Math.round(width * 1.3) }} />}
      />
    </Document>
  );
}

export default PdfPages;