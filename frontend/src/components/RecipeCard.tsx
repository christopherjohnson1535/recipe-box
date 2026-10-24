import type { RecipeSummary } from "@/lib/api";
import { formatMinutes, plateSrc } from "@/lib/recipe";
import { Badge } from "./ui/Chip";
import { DotList } from "./ui/DotList";
import { MagazineCard } from "./ui/MagazineCard";
import { iconForTag } from "./ui/spot-icons";

/** A recipe as one card in the home grid: up to two tags (a third would wrap the kicker on a phone), total time, title, description, photo. */
export function RecipeCard({ recipe, index }: { recipe: RecipeSummary; index?: number }) {
  // The first tag that has a spot icon draws the placeholder when there is no photo; a bowl otherwise.
  const icon = recipe.tags.map(iconForTag).find((n) => n !== "default") ?? "mains";
  return (
    <MagazineCard
      href={`/recipes/${recipe.id}`}
      title={recipe.title}
      kicker={
        recipe.tags.length > 0 ? (
          <DotList label="Tags">
            {recipe.tags.slice(0, 2).map((t) => (
              <li key={t}>
                <Badge>{t}</Badge>
              </li>
            ))}
          </DotList>
        ) : undefined
      }
      time={formatMinutes(recipe.totalMinutes)}
      deck={recipe.description || undefined}
      imageSrc={plateSrc(recipe)}
      fallbackIcon={icon}
      index={index}
      morphId={recipe.id}
    />
  );
}
