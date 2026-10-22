type Method = "error" | "warn";
let allowed: { method: Method; match: RegExp }[] = [];

/** Opt out for one test: console.<method> output matching `match` will not fail it. Reset after each test. */
export function expectConsole(method: Method, match: RegExp) {
  allowed.push({ method, match });
}

export const allowedConsole = (method: Method, text: string) =>
  allowed.some((a) => a.method === method && a.match.test(text));

export const resetConsoleAllowances = () => {
  allowed = [];
};
