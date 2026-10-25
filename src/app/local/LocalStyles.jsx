export default function LocalStyles() {
  return (
    <style jsx global>{`
      .local-control-page button:focus-visible {
        outline-color: currentColor;
      }
      @media (prefers-reduced-motion: reduce) {
        .local-control-page * {
          scroll-behavior: auto !important;
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    `}</style>
  );
}
