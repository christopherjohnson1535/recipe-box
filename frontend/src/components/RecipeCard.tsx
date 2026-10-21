import Link from "next/link";
import type { RecipeSummary } from "@/lib/api";
import { formatMinutes } from "@/lib/recipe";
import { Badge } from "./ui/Chip";

/** One entry in the contents listing: tag kicker, display title, italic deck, metadata, optional thumbnail. */
export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const time = formatMinutes(recipe.totalMinutes);
  return (
    <article className="group relative flex h-full gap-5 border-t border-rule py-6 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-focus sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {recipe.tags.length > 0 && (
          <ul className="label dot-list flex flex-wrap text-accent" aria-label="Tags">
            {recipe.tags.slice(0, 3).map((t) => (
              <li key={t}>
                <Badge>{t}</Badge>
              </li>
            ))}
          </ul>
        )}
        <h2 className="font-display text-title-sm text-ink transition-[color] duration-150 ease-out group-hover:text-accent">
          <Link
            href={`/recipes/${recipe.id}`}
            className="line-clamp-3 break-words after:absolute after:inset-0 focus-visible:outline-none"
          >
            {recipe.title}
          </Link>
        </h2>
        {recipe.description && <p className="line-clamp-2 text-body text-ink-muted italic">{recipe.description}</p>}
        {time && (
          <p className="label mt-1 text-ink-muted">
            <span>{time}</span>
          </p>
        )}
      </div>
      {recipe.imageUrl && (
        // Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send.
        <img
          src={recipe.imageUrl}
          alt=""
          width={160}
          height={120}
          loading="lazy"
          className="aspect-[4/3] h-auto w-24 shrink-0 self-start object-cover sm:w-36"
        />
      )}
    </article>
  );
}
