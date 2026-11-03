export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand ${large ? 'brand-large' : ''}`}>
      <span className="brand-star" aria-hidden="true">
        ✳
      </span>{' '}
      Citewise
    </span>
  );
}
