/** The line under the masthead rule on the home page: volume and number, the issue's name, today's date. */
export function IssueLine({
  volume,
  number,
  name,
  date,
  dateTime,
}: {
  /** Roman numeral. */
  volume: string;
  number: number;
  /** "The Autumn Issue". */
  name: string;
  /** The long date as printed. */
  date: string;
  /** The same day as YYYY-MM-DD. */
  dateTime: string;
}) {
  return (
    <p className="label-quiet flex flex-wrap justify-between gap-x-6 gap-y-0.5 text-(--entry-kicker-fg) sm:grid sm:grid-cols-3">
      <span>
        Vol.&nbsp;{volume} · No.&nbsp;{number}
      </span>
      <span className="sm:text-center">{name}</span>
      <time dateTime={dateTime} className="sm:text-end">
        {date}
      </time>
    </p>
  );
}
