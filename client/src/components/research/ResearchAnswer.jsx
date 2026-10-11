

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// [1] becomes a link to "#cite-1", which we render as a clickable chip
const withCiteLinks = (markdown) => markdown.replace(/\[(\d{1,2})\]/g, '[$1](#cite-$1)');

function ResearchAnswer({ markdown, onCite }) {
  return (
    <div className="answer-body ai-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('#cite-')) {
              const n = Number(href.slice(6));
              return (
                <button type="button" className="cite-chip" onClick={() => onCite(n)} title={`Jump to source ${n}`}>
                  {n}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {withCiteLinks(markdown)}
      </ReactMarkdown>
    </div>
  );
}

export default ResearchAnswer;