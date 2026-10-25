
function BrandMark({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-label="Preplytics" focusable="false">
      <rect className="bm-bg" width="32" height="32" rx="9" />
      <path className="bm-p" d="M11 24V8.5h6.1a4.6 4.6 0 0 1 0 9.2H11" />
      <circle className="bm-dot" cx="22.6" cy="22.4" r="2.5" />
    </svg>
  );
}

export default BrandMark;