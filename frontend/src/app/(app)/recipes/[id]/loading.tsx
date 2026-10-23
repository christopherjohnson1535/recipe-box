import { RecipeSkeleton } from "@/components/ui/Skeleton";

/** The recipe page's shape while it loads; the tapped card's photo and title morph into it. */
export default function Loading() {
  return <RecipeSkeleton />;
}
