import { ThumbsUp, TriangleAlert, Lightbulb } from 'lucide-react';

const TONE = { good: ThumbsUp, warn: TriangleAlert, info: Lightbulb };
const LABEL = { good: 'Going well', warn: 'Needs attention', info: 'Worth knowing' };

export default function Insights({ insights }) {
  if (!insights?.length) return null;
  return (
    <ul className="ax-insights" aria-label="Highlights">
      {insights.map((i) => {
        const Icon = TONE[i.tone] ?? Lightbulb;
        return (
          <li key={i.id} className={`ax-insight ax-insight-${i.tone}`}>
            <span className="ax-insight-icon"><Icon size={16} strokeWidth={2.2} /></span>
            <div>
              <strong>{LABEL[i.tone] ?? 'Insight'}</strong>
              <p>{i.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
