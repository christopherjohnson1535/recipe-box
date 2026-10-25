import { HardLink } from "@/components/ui/Button";
import { OrDivider } from "@/components/ui/OrDivider";
import { googleSignInUrl } from "@/lib/api";

/** The secondary way in, under the password form. A plain link: Google's page is a full navigation, not a popup. */
export function GoogleSignIn({ next }: { next: string }) {
  return (
    <div className="flex flex-col gap-4">
      <OrDivider />
      <HardLink href={googleSignInUrl(next)} variant="secondary" className="w-full">
        Sign in with Google
      </HardLink>
    </div>
  );
}
