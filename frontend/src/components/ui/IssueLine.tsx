/** The line under the masthead rule on the home page: volume and number, the issue's name, today's date. */
export function IssueLine({
  volume,
  number,
  name,
  date,
  dateTime,
}: {
  /** Roman numeral. Omitted with `number` when the whole box could not be counted. */
  volume?: string;
  number?: number;
  /** "The Autumn Issue". */
  name: string;
  /** The long date as printed. */
  date: string;
  /** The same day as YYYY-MM-DD. */
  dateTime: string;
}) {
  return (
    <p className="label-quiet flex flex-wrap justify-between gap-x-6 gap-y-0.5 text-(--entry-kicker-fg) max-sm:justify-start max-sm:gap-x-0 sm:grid sm:grid-cols-3">
      <span>{volume !== undefined && number !== undefined && <>Vol.&nbsp;{volume} · No.&nbsp;{number}</>}</span>
      <span className="max-sm:before:mx-2 max-sm:before:content-['·'] sm:text-center sm:before:content-none">{name}</span>
      <time dateTime={dateTime} className="max-sm:basis-full sm:text-end">
        {date}
      </time>
    </p>
  );
}
