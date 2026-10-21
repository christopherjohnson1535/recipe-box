import { PasswordForm } from "@/components/settings/PasswordForm";
import { DetailList } from "@/components/ui/DetailList";
import { Heading } from "@/components/ui/Heading";
import type { User } from "@/lib/api";

/** Who you are signed in as, and a way to change your own password. */
export function AccountSection({ user }: { user: User }) {
  return (
    <section aria-labelledby="account-heading" className="flex flex-col gap-6">
      <Heading level={2} id="account-heading" ruled>
        My account
      </Heading>
      <DetailList
        items={[
          { term: "Name", value: user.displayName },
          { term: "Username", value: user.username },
        ]}
      />
      <div className="flex max-w-measure flex-col gap-4">
        <Heading level={3} size="label">
          Change your password
        </Heading>
        <PasswordForm userId={user.id} username={user.username} askCurrent submitLabel="Change password" idPrefix="own" />
      </div>
    </section>
  );
}
