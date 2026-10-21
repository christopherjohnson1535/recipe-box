import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type User } from "@/lib/api";
import { HouseholdSection } from "./HouseholdSection";
import { PasswordForm } from "./PasswordForm";
import { SettingsView } from "./SettingsView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

const user = (id: string, displayName: string, role: User["role"] = "member"): User => ({
  id,
  displayName,
  username: displayName.toLowerCase(),
  role,
  createdAt: "2026-10-21T10:00:00Z",
});
const chris = user("u1", "Chris", "admin");
const sam = user("u2", "Sam");

const fakeApi = (over: Partial<Record<"createUser" | "deleteUser" | "setPassword" | "me", ReturnType<typeof vi.fn>>> = {}) => ({
  createUser: vi.fn(),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  setPassword: vi.fn().mockResolvedValue(undefined),
  me: vi.fn().mockResolvedValue(chris),
  ...over,
});
type FakeApi = ReturnType<typeof fakeApi>;
const asApi = (a: FakeApi) => a as unknown as NonNullable<Parameters<typeof HouseholdSection>[0]["api"]>;

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submitAdd = () => fireEvent.submit(screen.getByRole("button", { name: "Add member" }).closest("form")!);

describe("HouseholdSection", () => {
  it("adds a member and lists them", async () => {
    const api = fakeApi({ createUser: vi.fn().mockResolvedValue(user("u3", "Alex")) });
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris, sam]} api={asApi(api)} />);
    type("Name", "Alex");
    type("Username", "alex");
    type("Temporary password", "longenough1");
    submitAdd();
    await waitFor(() => expect(screen.getByRole("list", { name: "Household members" }).textContent).toContain("Alex"));
    expect(api.createUser).toHaveBeenCalledWith({ displayName: "Alex", username: "alex", password: "longenough1", role: "member" });
    expect(screen.getByRole("status").textContent).toContain("Alex was added");
  });

  it("shows a taken username on the username field", async () => {
    const api = fakeApi({ createUser: vi.fn().mockRejectedValue(new ApiError(409, "conflict", "Username already exists.")) });
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris]} api={asApi(api)} />);
    type("Name", "Sam");
    type("Username", "sam");
    type("Temporary password", "longenough1");
    submitAdd();
    const field = await screen.findByLabelText("Username");
    await waitFor(() => expect(field.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById("username-msg")?.textContent).toContain("taken");
  });

  it("validates before calling the API", () => {
    const api = fakeApi();
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris]} api={asApi(api)} />);
    type("Name", "Sam");
    type("Username", "Bad Name");
    type("Temporary password", "short");
    submitAdd();
    expect(api.createUser).not.toHaveBeenCalled();
    expect(document.getElementById("username-msg")?.textContent).toContain("lowercase");
    expect(document.getElementById("password-msg")?.textContent).toContain("at least 10");
  });

  it("asks for confirmation naming the person, then deletes", async () => {
    const api = fakeApi();
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris, sam]} api={asApi(api)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
    expect(api.deleteUser).not.toHaveBeenCalled();
    const confirm = screen.getByRole("group", { name: "Confirm" });
    expect(confirm.textContent).toContain("Remove Sam from the household?");
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove Sam" }));
    await waitFor(() => expect(api.deleteUser).toHaveBeenCalledWith("u2"));
    await waitFor(() => expect(screen.getByRole("list", { name: "Household members" }).textContent).not.toContain("Sam"));
  });

  it("keeps the person when the confirmation is cancelled", () => {
    const api = fakeApi();
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris, sam]} api={asApi(api)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(api.deleteUser).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Confirm" })).toBeNull();
  });

  it("can't remove yourself or the last admin, and says why", () => {
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris, sam]} api={asApi(fakeApi())} />);
    expect((screen.getByRole("button", { name: "Remove Chris" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You can’t remove yourself.")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    cleanup();
    // Someone else is the only admin.
    const boss = user("u9", "Boss", "admin");
    render(<HouseholdSection currentUserId="u2" initialUsers={[boss, sam]} api={asApi(fakeApi())} />);
    expect((screen.getByRole("button", { name: "Remove Boss" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/only admin/)).toBeTruthy();
  });

  it("resets another member's password without a current password", async () => {
    const api = fakeApi();
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris, sam]} api={asApi(api)} />);
    expect(screen.queryByRole("button", { name: "Reset password for Chris" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset password for Sam" }));
    const panel = screen.getByRole("group", { name: "Reset password for Sam" });
    expect(within(panel).queryByLabelText("Current password")).toBeNull();
    fireEvent.change(within(panel).getByLabelText("New password"), { target: { value: "brand-new-pass" } });
    fireEvent.change(within(panel).getByLabelText("Confirm new password"), { target: { value: "brand-new-pass" } });
    fireEvent.submit(panel.querySelector("form")!);
    await waitFor(() => expect(api.setPassword).toHaveBeenCalledWith("u2", "brand-new-pass", undefined));
  });
});

describe("HouseholdSection edge cases", () => {
  it("drops the row and refreshes when the member is already gone", async () => {
    const api = fakeApi({ deleteUser: vi.fn().mockRejectedValue(new ApiError(404, "not_found", "No such user.")) });
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris, sam]} api={asApi(api)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove Sam" })[1]);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No such user."));
    expect(screen.queryByText("Sam")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("ties the disabled Remove to its reason", () => {
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris]} api={asApi(fakeApi())} />);
    const remove = screen.getByRole("button", { name: "Remove Chris" });
    expect(remove.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(remove.getAttribute("aria-describedby")!)?.textContent).toContain("yourself");
  });
});

describe("PasswordForm (own password)", () => {
  const setup = (setPassword = vi.fn().mockResolvedValue(undefined), me = vi.fn().mockResolvedValue(chris)) => {
    render(<PasswordForm userId="u1" username="chris" askCurrent submitLabel="Change password" idPrefix="own" api={{ setPassword, me }} />);
    return setPassword;
  };
  const fill = (current: string, next: string, confirm: string) => {
    type("Current password", current);
    type("New password", next);
    type("Confirm new password", confirm);
    fireEvent.submit(screen.getByRole("button", { name: "Change password" }).closest("form")!);
  };

  it("flags a mismatch on the confirm field", () => {
    const setPassword = setup();
    fill("old-password", "new-password-1", "new-password-2");
    expect(document.getElementById("own-confirm-msg")?.textContent).toContain("don’t match");
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("flags a short password", () => {
    const setPassword = setup();
    fill("old-password", "short", "short");
    expect(document.getElementById("own-password-msg")?.textContent).toContain("at least 10");
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("puts a wrong current password on the current field", async () => {
    setup(vi.fn().mockRejectedValue(new ApiError(401, "unauthenticated", "Wrong username or password.")));
    fill("wrong-password", "new-password-1", "new-password-1");
    await waitFor(() => expect(document.getElementById("own-current-msg")?.textContent).toContain("current password"));
    expect(screen.getByLabelText("Current password").getAttribute("aria-invalid")).toBe("true");
  });

  it("says you were signed out when the 401 is an expired session", async () => {
    setup(
      vi.fn().mockRejectedValue(new ApiError(401, "unauthenticated", "Wrong username or password.")),
      vi.fn().mockRejectedValue(new ApiError(401, "unauthenticated", "Please sign in.")),
    );
    fill("old-password", "new-password-1", "new-password-1");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("signed out"));
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(document.getElementById("own-current-msg")).toBeNull();
  });

  it("has a username field for password managers", () => {
    setup();
    expect((document.querySelector("input[autocomplete=username]") as HTMLInputElement).value).toBe("chris");
  });

  it("confirms success and sends the current password", async () => {
    const setPassword = setup();
    fill("old-password", "new-password-1", "new-password-1");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Password changed"));
    expect(setPassword).toHaveBeenCalledWith("u1", "new-password-1", "old-password");
  });
});

describe("SettingsView", () => {
  it("shows the Household section to admins only", () => {
    render(<SettingsView me={chris} users={[chris, sam]} capabilities={{ ai: false, provider: "none" }} />);
    expect(screen.getByRole("heading", { name: "Household" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /AI Photo Import/ })).toBeTruthy();
    cleanup();
    render(<SettingsView me={sam} users={[]} capabilities={{ ai: true, provider: "anthropic" }} />);
    expect(screen.queryByRole("heading", { name: "Household" })).toBeNull();
    expect(screen.getByRole("heading", { name: "My account" })).toBeTruthy();
    expect(screen.getByText("on")).toBeTruthy();
  });
});
