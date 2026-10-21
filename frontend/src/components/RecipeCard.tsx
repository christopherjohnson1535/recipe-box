import Link from "next/link";
import type { RecipeSummary } from "@/lib/api";
import { formatMinutes } from "@/lib/recipe";
import { Badge } from "./ui/Chip";
import { Card } from "./ui/Card";

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const time = formatMinutes(recipe.totalMinutes);
  return (
    <Card className="group overflow-hidden transition-[border-color] duration-150 ease-out focus-within:border-accent hover:border-border-strong">
      <Link href={`/recipes/${recipe.id}`} className="flex h-full flex-col focus-visible:outline-none">
        <div className="aspect-[4/3] bg-surface-sunk">
          {recipe.imageUrl ? (
            // Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send.
            <img
              src={recipe.imageUrl}
              alt=""
              width={400}
              height={300}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-border-strong" aria-hidden="true">
              <svg viewBox="0 0 512 512" width="56" height="56" fill="currentColor">
                <path d="M112 264H400A144 144 0 0 1 112 264Z" />
                <rect x="200" y="414" width="112" height="26" rx="13" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h2 className="line-clamp-2 text-lg font-semibold text-text group-hover:text-accent-ink">{recipe.title}</h2>
          {time && <p className="text-sm text-muted tabular-nums">{time}</p>}
          {recipe.tags.length > 0 && (
            <ul className="mt-auto flex flex-wrap gap-1.5 pt-1" aria-label="Tags">
              {recipe.tags.slice(0, 4).map((t) => (
                <li key={t}>
                  <Badge>{t}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Link>
    </Card>
  );
}
