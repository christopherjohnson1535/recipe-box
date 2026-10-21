import type { RecipeSummary } from "@/lib/api";
import { formatMinutes } from "@/lib/recipe";
import { Badge } from "./ui/Chip";
import { ContentsEntry } from "./ui/Contents";
import { DotList } from "./ui/DotList";

/** A recipe as one entry in the contents listing: up to three tags, title, description, total time, photo. */
export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <ContentsEntry
      href={`/recipes/${recipe.id}`}
      title={recipe.title}
      kicker={
        recipe.tags.length > 0 ? (
          <DotList label="Tags">
            {recipe.tags.slice(0, 3).map((t) => (
              <li key={t}>
                <Badge>{t}</Badge>
              </li>
            ))}
          </DotList>
        ) : undefined
      }
      deck={recipe.description || undefined}
      meta={formatMinutes(recipe.totalMinutes)}
      imageSrc={recipe.imageUrl}
    />
  );
}
