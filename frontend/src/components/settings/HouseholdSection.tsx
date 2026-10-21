"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { Heading } from "@/components/ui/Heading";
import { MemberItem, MemberList } from "@/components/ui/MemberList";
import { Panel } from "@/components/ui/Panel";
import { api as browserApi, ApiError, type Api, type User } from "@/lib/api";
import { AddMemberForm } from "./AddMemberForm";
import { PasswordForm } from "./PasswordForm";

type Props = {
  currentUserId: string;
  initialUsers: User[];
  api?: Pick<Api, "createUser" | "deleteUser" | "setPassword" | "me">;
};

type Open = { id: string; kind: "reset" | "remove" } | null;

/** Admin only: the household list, add, reset password and remove. */
export function HouseholdSection({ currentUserId, initialUsers, api = browserApi }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const resetButtons = useRef(new Map<string, HTMLButtonElement>());

  const adminCount = users.filter((u) => u.role === "admin").length;

  async function remove(user: User) {
    setRemoving(true);
    setNotice(null);
    try {
      await api.deleteUser(user.id);
      setUsers((list) => list.filter((u) => u.id !== user.id));
      setNotice({ tone: "info", text: `${user.displayName} was removed and signed out everywhere.` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Already gone (another admin removed them): drop the stale row and reload.
        setUsers((list) => list.filter((u) => u.id !== user.id));
        router.refresh();
      }
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : `Couldn’t remove ${user.displayName}. Try again.` });
    } finally {
      setOpen(null);
      setRemoving(false);
      heading.current?.focus();
    }
  }

  function closeReset(user: User, done: boolean) {
    setOpen(null);
    setNotice(null);
    if (done) setNotice({ tone: "info", text: `${user.displayName}’s password was changed and they were signed out.` });
    requestAnimationFrame(() => resetButtons.current.get(user.id)?.focus());
  }

  return (
    <section aria-labelledby="household-heading" className="flex flex-col gap-6">
      <Heading level={2} id="household-heading" ruled ref={heading} tabIndex={-1}>
        Household
      </Heading>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <MemberList label="Household members">
        {users.map((u) => {
          const isYou = u.id === currentUserId;
          const lastAdmin = u.role === "admin" && adminCount <= 1;
          const blocked = isYou ? "You can’t remove yourself." : lastAdmin ? "The only admin can’t be removed. Add another admin first." : null;
          const mine = open?.id === u.id ? open.kind : null;
          return (
            <MemberItem
              key={u.id}
              name={u.displayName}
              marker={isYou ? "You" : undefined}
              detail={`${u.username} · ${u.role === "admin" ? "Admin" : "Member"}`}
              actions={
                <>
                  {!isYou && (
                    <Button
                      variant="secondary"
                      ref={(el) => {
                        if (el) resetButtons.current.set(u.id, el);
                        else resetButtons.current.delete(u.id);
                      }}
                      aria-label={`Reset password for ${u.displayName}`}
                      aria-expanded={mine === "reset"}
                      onClick={() => {
                        setNotice(null);
                        setOpen(mine === "reset" ? null : { id: u.id, kind: "reset" });
                      }}
                    >
                      Reset password
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${u.displayName}`}
                    disabled={blocked !== null}
                    aria-describedby={blocked ? `remove-note-${u.id}` : undefined}
                    onClick={() => {
                      setNotice(null);
                      setOpen({ id: u.id, kind: "remove" });
                    }}
                  >
                    Remove
                  </Button>
                </>
              }
              note={blocked}
              noteId={`remove-note-${u.id}`}
              panel={
                mine === "reset" ? (
                  <Panel label={`Reset password for ${u.displayName}`}>
                    <PasswordForm
                      userId={u.id}
                      askCurrent={false}
                      submitLabel="Set new password"
                      idPrefix={`reset-${u.id}`}
                      api={api}
                      onDone={() => closeReset(u, true)}
                      onCancel={() => closeReset(u, false)}
                    />
                  </Panel>
                ) : mine === "remove" ? (
                  <ConfirmInline
                    confirmLabel={`Remove ${u.displayName}`}
                    pending={removing}
                    onConfirm={() => remove(u)}
                    onCancel={() => setOpen(null)}
                  >
                    Remove {u.displayName} from the household? They are signed out on every device and can’t sign in again.
                  </ConfirmInline>
                ) : undefined
              }
            />
          );
        })}
      </MemberList>
      <div className="flex flex-col gap-4">
        <Heading level={3} size="label">
          Add a member
        </Heading>
        <AddMemberForm
          api={api}
          onAdded={(user) => {
            setUsers((list) => [...list, user]);
            setNotice({ tone: "info", text: `${user.displayName} was added. Give them the username and temporary password.` });
          }}
        />
      </div>
    </section>
  );
}
