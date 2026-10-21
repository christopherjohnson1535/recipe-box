/** Label and value pairs (name, username): a definition list with uppercase terms. */
export function DetailList({ items }: { items: readonly { term: string; value: string }[] }) {
  return (
    <dl className="grid max-w-measure grid-cols-[auto_1fr] gap-x-6 gap-y-2">
      {items.map((i) => (
        <div key={i.term} className="contents">
          <dt className="label text-ink-muted">{i.term}</dt>
          <dd className="text-body break-words text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
