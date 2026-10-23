import { HomeSkeleton } from "@/components/ui/Skeleton";

/** Shown while a page waits for the API: the home page's shape on "/", a plain note elsewhere. Same column, so nothing shifts. */
export default function Loading() {
  return <HomeSkeleton />;
}
