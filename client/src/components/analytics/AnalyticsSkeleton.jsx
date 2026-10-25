export default function AnalyticsSkeleton() {
  return (
    <div className="ax-skel" aria-busy="true" aria-label="Loading analytics">
      <div className="ax-skel-kpis">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}
      </div>
      <div className="skeleton ax-skel-hero" />
      <div className="skeleton ax-skel-hero" />
      <div className="ax-skel-pair">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}
