import { ApiError } from "@/lib/api";
import { Alert } from "./ui/Alert";
import { RetryButton } from "./RetryButton";

/** Shown in place of page content when an API call fails, so pages degrade instead of crashing. */
export function ServerError({ error }: { error: unknown }) {
  const unreachable = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert tone="error" title={unreachable ? "Can’t reach the Recipe Box server" : "Something went wrong"}>
        {unreachable
          ? "The server may be starting up or offline. Wait a moment, then try again."
          : (error as ApiError).message}
      </Alert>
      <RetryButton />
    </div>
  );
}
