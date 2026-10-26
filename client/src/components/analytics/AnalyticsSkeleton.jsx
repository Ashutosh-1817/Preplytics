export default function AnalyticsSkeleton() {
  return (
    <div className="ax-bento" aria-busy="true" aria-label="Loading analytics">
      <div className="ax-cell-hero"><div className="skeleton ax-skel-block" style={{ minHeight: 560 }} /></div>
      <div className="ax-cell-study"><div className="skeleton ax-skel-block" style={{ minHeight: 270 }} /></div>
      <div className="ax-cell-streak"><div className="skeleton ax-skel-block" style={{ minHeight: 270 }} /></div>
      <div className="ax-cell-topics"><div className="skeleton ax-skel-block" style={{ minHeight: 270 }} /></div>
      <div className="ax-span-12"><div className="skeleton ax-skel-block" style={{ minHeight: 380 }} /></div>
    </div>
  );
}
