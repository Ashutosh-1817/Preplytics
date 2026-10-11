

import { ExternalLink, Calendar } from 'lucide-react';

const TONES = ['signal', 'highlight', 'warm', 'alert'];

const formatPublished = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function SourceCard({ source, index, highlighted }) {
  const published = formatPublished(source.publishedDate);
  // Only ever link to real web pages
  const safeUrl = /^https?:\/\//i.test(source.url) ? source.url : undefined;

  return (
    <a
      id={`source-${index + 1}`}
      className={`source-card source-tone-${TONES[index % TONES.length]} ${highlighted ? 'source-card-highlight' : ''}`}
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="source-top">
        <span className="source-num">{index + 1}</span>
        <span className="source-domain">{source.domain}</span>
        <ExternalLink size={14} className="source-ext" />
      </div>

      <h4 className="source-title">{source.title}</h4>
      <p className="source-snippet">{source.content}</p>

      {published && (
        <span className="source-date"><Calendar size={12} /> {published}</span>
      )}
    </a>
  );
}

export default SourceCard;