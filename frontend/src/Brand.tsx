export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`font-serif font-medium tracking-tight ${
        large ? 'text-3xl' : 'text-2xl'
      }`}
    >
      Citewise
      <span aria-hidden="true" className="citation">
        1
      </span>
    </span>
  )
}
