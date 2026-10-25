export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

/** The calendar day of a Date in its own (local) zone as YYYY-MM-DD. */
export const dayKey = (d: Date) =>
  [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");

/** A noon Date on that calendar day, so local-getter helpers (`seasonOf`, `bandDate`) read the right day in any zone. */
export const noon = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

/** Northern-hemisphere seasons by calendar month, read from the Date's own zone. */
export function seasonOf(date: Date): Season {
  const m = date.getMonth(); // 0 = January
  if (m >= 2 && m <= 4) return "Spring";
  if (m >= 5 && m <= 7) return "Summer";
  if (m >= 8 && m <= 10) return "Autumn";
  return "Winter";
}

/** "Sunday, October 25": weekday, month and day, no year. */
export const bandDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date);
