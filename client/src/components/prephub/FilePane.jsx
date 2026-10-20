import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { fetchFileBlob, downloadFileToDisk, getErrorMessage } from '../../services/files.api.js';

const PdfReader = lazy(() => import('./PdfReader.jsx'));

function ImagePane({ file }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  const [actual, setActual] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    setUrl(null);
    setError('');

    fetchFileBlob(file._id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load this image.'));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file._id, reloadKey]);

  return (
    <div className="ph-img">
      <div className="ph-pdf-bar">
        <span className="ph-pdf-zoom">{file.fileName}</span>
        <span className="ph-pdf-spacer" />
        <button type="button" className="ph-icon-btn" onClick={() => downloadFileToDisk(file).catch(() => {})} aria-label="Download" title="Download">
          <Download size={15} />
        </button>
      </div>
      <div className={`ph-img-stage ${actual ? 'ph-img-actual' : ''}`}>
        {error && (
          <div className="ph-pdf-state">
            <AlertCircle size={20} />
            <p>{error}</p>
            <button type="button" className="ph-btn" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}
        {!error && !url && (
          <div className="ph-pdf-state">
            <Loader2 size={20} className="ph-spin" />
          </div>
        )}
        {url && (
          <img
            src={url}
            alt={file.fileName}
            onClick={() => setActual((v) => !v)}
            title={actual ? 'Click to fit the window' : 'Click for actual size'}
          />
        )}
      </div>
    </div>
  );
}

function FilePane({ file }) {
  if (file.fileType === 'image') return <ImagePane key={file._id} file={file} />;

  return (
    <Suspense
      fallback={
        <div className="ph-pdf-state">
          <Loader2 size={20} className="ph-spin" />
        </div>
      }
    >
      <PdfReader key={file._id} file={file} />
    </Suspense>
  );
}

export default FilePane;