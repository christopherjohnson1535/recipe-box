import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Identity, type User } from "@/lib/api";
import { GoogleSignInSection } from "./GoogleSignInSection";
import { HouseholdSection } from "./HouseholdSection";
import { SettingsView } from "./SettingsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const replace = vi.spyOn(window.history, "replaceState");
afterEach(() => vi.unstubAllGlobals());

const linked: Identity = { id: "i1", provider: "google", email: "chris@gmail.com", createdAt: "2026-10-20T10:00:00Z" };
const fakeApi = (deleteIdentity = vi.fn().mockResolvedValue(undefined)) => ({ deleteIdentity });
const open = (initial: Identity[] | null, available: boolean | null, result?: string, api = fakeApi()) => {
  replace.mockClear();
  render(<GoogleSignInSection initial={initial} available={available} result={result} api={api} />);
  return api;
};

describe("GoogleSignInSection", () => {
  it("offers Connect Google as a plain link to the API's link flow", () => {
    open([], true);
    expect(screen.getByRole("heading", { level: 2, name: "Sign in with Google" })).toBeTruthy();
    const link = screen.getByRole("link", { name: "Connect Google" });
    expect(link.getAttribute("href")).toBe("/api/auth/google/start?link=1");
    expect(link.getAttribute("aria-describedby")).toBe(screen.getByText(/takes you to Google/).id);
    expect(screen.queryByRole("list", { name: "Connected Google accounts" })).toBeNull();
  });

  it("tells a Home Screen app to connect from the browser", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(display-mode: standalone)" }));
    open([], true);
    expect(screen.getByText(/Open Recipe Box in Safari, sign in with your password there, then connect Google from Settings/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect Google" })).toBeTruthy();
  });

  it("does not claim Sign in with Google is off when the providers could not be loaded", () => {
    open([], null);
    expect(screen.getByText(/Couldn’t check whether Sign in with Google is on/)).toBeTruthy();
    expect(screen.queryByText(/is off for this household/)).toBeNull();
    expect(screen.queryByRole("link", { name: "deploy guide" })).toBeNull();
  });

  it("drops the intro when it is off and nothing is connected", () => {
    open([], false);
    expect(screen.queryByText(/instead of typing your password/)).toBeNull();
  });

  it("lists linked accounts with Disconnect, and still offers another", () => {
    open([linked], true);
    const list = screen.getByRole("list", { name: "Connected Google accounts" });
    expect(list.textContent).toContain("chris@gmail.com");
    expect(screen.getByRole("button", { name: "Disconnect chris@gmail.com" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect Google" })).toBeTruthy();
  });

  it("says it is off, with no Connect link, when the server has no Google sign-in", () => {
    open([], false);
    expect(screen.getByText(/Sign in with Google is off for this household/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "deploy guide" }).getAttribute("href")).toContain("DEPLOY.md#sign-in-with-google-optional");
    expect(screen.queryByRole("link", { name: "Connect Google" })).toBeNull();
  });

  it("still lets you disconnect an account when the feature has since been turned off", () => {
    open([linked], false);
    expect(screen.getByRole("button", { name: "Disconnect chris@gmail.com" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Connect Google" })).toBeNull();
  });

  it("says so when the accounts could not be loaded", () => {
    open(null, true);
    expect(screen.getByText(/Couldn’t check your connected Google accounts/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Connect Google" })).toBeNull();
  });

  it("asks first; Stay connected changes nothing and returns focus", async () => {
    const api = open([linked], true);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect chris@gmail.com" }));
    const confirm = screen.getByRole("group", { name: "Confirm" });
    expect(confirm.textContent).toContain("You can still sign in with your username and password.");
    expect(confirm.textContent).toContain("If your household email matches this Google account, signing in with Google links it again");
    expect(confirm.textContent).toContain("ask the admin to change the email");
    fireEvent.click(within(confirm).getByRole("button", { name: "Stay connected" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Disconnect chris@gmail.com" })));
    expect(api.deleteIdentity).not.toHaveBeenCalled();
  });

  it("disconnects after the confirmation and announces it", async () => {
    const api = open([linked], true);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect chris@gmail.com" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Connected Google accounts" })).toBeNull());
    expect(api.deleteIdentity).toHaveBeenCalledWith("i1");
    expect(screen.getAllByRole("status")[0].textContent).toBe("chris@gmail.com was disconnected.");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Sign in with Google" }));
  });

  it("shows why a disconnect failed and keeps the account", async () => {
    open([linked], true, undefined, fakeApi(vi.fn().mockRejectedValue(new ApiError(404, "not_found", "No such account."))));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect chris@gmail.com" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Disconnect" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No such account.");
    expect(screen.getByRole("list", { name: "Connected Google accounts" })).toBeTruthy();
  });

  it("announces ?signin=linked once and takes it out of the address", async () => {
    open([linked], true, "linked");
    const region = screen.getAllByRole("status")[0];
    await waitFor(() => expect(region.textContent).toContain("Google account connected."));
    expect(replace).toHaveBeenCalledWith(null, "", "/settings");
  });

  it.each([
    ["taken", /already connected to another member/],
    ["error", /Couldn’t connect your Google account/],
  ])("announces ?signin=%s as an alert", async (result, text) => {
    open([], true, result);
    expect((await screen.findByRole("alert")).textContent).toMatch(text);
    expect(replace).toHaveBeenCalledWith(null, "", "/settings");
  });

  it("ignores an unknown ?signin=, including names that exist on every object", async () => {
    open([], true, "constructor");
    await Promise.resolve();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("status").every((r) => r.textContent === "")).toBe(true);
  });
});

describe("SettingsView sign-in section", () => {
  const sam: User = { id: "u2", displayName: "Sam", username: "sam", role: "member", email: null, createdAt: "2026-10-21T10:00:00Z" };

  it("is there for a plain member, apart from Google Tasks", () => {
    render(<SettingsView me={sam} users={[]} capabilities={null} identities={[linked]} providers={{ google: true }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Sign in with Google" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Google Tasks" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect Google" })).toBeTruthy();
  });
});

describe("HouseholdSection member email", () => {
  const chris: User = { id: "u1", displayName: "Chris", username: "chris", role: "admin", email: "chris@gmail.com", createdAt: "2026-10-21T10:00:00Z" };
  const sam: User = { id: "u2", displayName: "Sam", username: "sam", role: "member", email: null, createdAt: "2026-10-21T10:00:00Z" };
  const fake = (updateUserEmail = vi.fn()) => ({ createUser: vi.fn(), deleteUser: vi.fn(), setPassword: vi.fn(), me: vi.fn(), updateUserEmail });
  const show = (api: ReturnType<typeof fake>) =>
    render(<HouseholdSection currentUserId="u1" initialUsers={[chris, sam]} api={api as unknown as NonNullable<Parameters<typeof HouseholdSection>[0]["api"]>} />);
  const save = () => fireEvent.submit(screen.getByRole("button", { name: "Save email" }).closest("form")!);

  it("shows each member's email and the right button for having one or not", () => {
    show(fake());
    expect(screen.getByRole("list", { name: "Household members" }).textContent).toContain("chris · Admin · chris@gmail.com");
    expect(screen.getByRole("button", { name: "Change Google email for Chris" }).textContent).toBe("Change Google email");
    expect(screen.getByRole("button", { name: "Add Google email for Sam" }).textContent).toBe("Add Google email");
  });

  it("saves an email, shows it and says so", async () => {
    const api = fake(vi.fn().mockResolvedValue({ ...sam, email: "sam@gmail.com" }));
    show(api);
    fireEvent.click(screen.getByRole("button", { name: "Add Google email for Sam" }));
    fireEvent.change(screen.getByLabelText("Google email"), { target: { value: "  sam@gmail.com " } });
    save();
    await waitFor(() => expect(screen.getByRole("list", { name: "Household members" }).textContent).toContain("sam · Member · sam@gmail.com"));
    expect(api.updateUserEmail).toHaveBeenCalledWith("u2", "sam@gmail.com");
    expect(screen.getByRole("status").textContent).toBe("Sam can now sign in with Google as sam@gmail.com.");
    expect(screen.queryByLabelText("Google email")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change Google email for Sam" })));
  });

  it("warns before saving that changing or clearing disconnects Google sign-in, but not for a first email", () => {
    show(fake());
    fireEvent.click(screen.getByRole("button", { name: "Add Google email for Sam" }));
    expect(screen.queryByText(/also disconnects their Google sign-in/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Change Google email for Chris" }));
    expect(screen.getByText(/Changing or clearing the email also disconnects their Google sign-in; they can sign in with Google again with the new email/)).toBeTruthy();
  });

  it("says the connected accounts were disconnected after a change or clear, not after the same email or a first one", async () => {
    const updateUserEmail = vi.fn();
    show(fake(updateUserEmail));
    const edit = async (name: string, saved: User) => {
      updateUserEmail.mockResolvedValueOnce(saved);
      fireEvent.click(screen.getByRole("button", { name }));
      save();
      await waitFor(() => expect(screen.queryByLabelText("Google email")).toBeNull());
    };
    await edit("Change Google email for Chris", chris); // same address again: links stay
    expect(screen.getByRole("status").textContent).toBe("Chris can now sign in with Google as chris@gmail.com.");
    await edit("Add Google email for Sam", { ...sam, email: "sam@gmail.com" }); // first email: links stay
    expect(screen.getByRole("status").textContent).toBe("Sam can now sign in with Google as sam@gmail.com.");
    await edit("Change Google email for Sam", { ...sam, email: "sam2@gmail.com" });
    expect(screen.getByRole("status").textContent).toBe("Sam can now sign in with Google as sam2@gmail.com. Their connected Google accounts were disconnected.");
    await edit("Change Google email for Chris", { ...chris, email: null });
    expect(screen.getByRole("status").textContent).toBe("Chris’s Google email was removed. Their connected Google accounts were disconnected.");
  });

  it("clears the email when the field is left blank", async () => {
    const api = fake(vi.fn().mockResolvedValue({ ...chris, email: null }));
    show(api);
    fireEvent.click(screen.getByRole("button", { name: "Change Google email for Chris" }));
    expect((screen.getByLabelText("Google email") as HTMLInputElement).value).toBe("chris@gmail.com");
    fireEvent.change(screen.getByLabelText("Google email"), { target: { value: "" } });
    save();
    await waitFor(() => expect(api.updateUserEmail).toHaveBeenCalledWith("u1", null));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Chris’s Google email was removed. Their connected Google accounts were disconnected."));
  });

  it("says another member has the email (409) on the field and keeps the form open", async () => {
    show(fake(vi.fn().mockRejectedValue(new ApiError(409, "conflict", "That email is already used by another member."))));
    fireEvent.click(screen.getByRole("button", { name: "Add Google email for Sam" }));
    fireEvent.change(screen.getByLabelText("Google email"), { target: { value: "chris@gmail.com" } });
    save();
    const input = await screen.findByLabelText("Google email");
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(input.id + "-msg")?.textContent).toMatch(/Another member already uses that email/);
    expect(document.activeElement).toBe(input);
  });

  it("explains a malformed email (400)", async () => {
    show(fake(vi.fn().mockRejectedValue(new ApiError(400, "validation", "email: must look like name@example.com."))));
    fireEvent.click(screen.getByRole("button", { name: "Add Google email for Sam" }));
    fireEvent.change(screen.getByLabelText("Google email"), { target: { value: "nope" } });
    save();
    await waitFor(() => expect(screen.getByText(/Enter an address like name@example.com/)).toBeTruthy());
  });

  it("cancel closes the form and changes nothing", () => {
    const api = fake();
    show(api);
    fireEvent.click(screen.getByRole("button", { name: "Add Google email for Sam" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Google email")).toBeNull();
    expect(api.updateUserEmail).not.toHaveBeenCalled();
  });

  it("adds an email when creating a member, and omits it when blank", async () => {
    const createUser = vi.fn().mockResolvedValue({ ...sam, id: "u3", displayName: "Alex", username: "alex", email: "alex@gmail.com" });
    show({ ...fake(), createUser });
    const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Add member" }).closest("form")!);
    fill("Name", "Alex");
    fill("Username", "alex");
    fill("Temporary password", "longenough1");
    fill("Google email (optional)", " alex@gmail.com ");
    submit();
    await waitFor(() => expect(createUser).toHaveBeenCalledWith({ displayName: "Alex", username: "alex", password: "longenough1", role: "member", email: "alex@gmail.com" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Alex was added"));
    createUser.mockResolvedValue({ ...sam, id: "u4", displayName: "Bo", username: "bo-b" });
    fill("Name", "Bo");
    fill("Username", "bo-b");
    fill("Temporary password", "longenough1");
    submit();
    await waitFor(() => expect(createUser).toHaveBeenLastCalledWith({ displayName: "Bo", username: "bo-b", password: "longenough1", role: "member" }));
  });

  it("puts a taken username from create on the username, with or without an email", async () => {
    const createUser = vi.fn().mockRejectedValue(new ApiError(409, "conflict", "That username is already taken."));
    show({ ...fake(), createUser });
    const fillAll = (email: string) => {
      for (const [label, value] of [["Name", "Alex"], ["Username", "chris"], ["Temporary password", "longenough1"], ["Google email (optional)", email]])
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.submit(screen.getByRole("button", { name: "Add member" }).closest("form")!);
    };
    fillAll("");
    await waitFor(() => expect(document.getElementById("username-msg")?.textContent).toContain("taken"));
    fillAll("alex@gmail.com");
    await waitFor(() => expect(createUser).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.getElementById("username-msg")?.textContent).toContain("taken"));
    expect(document.getElementById("email-msg")?.textContent ?? "").not.toContain("already uses");
  });

  it("puts a taken email from create on the email field, not the username", async () => {
    const createUser = vi.fn().mockRejectedValue(new ApiError(409, "conflict", "That email is already used by another member."));
    show({ ...fake(), createUser });
    for (const [label, value] of [["Name", "Alex"], ["Username", "alex"], ["Temporary password", "longenough1"], ["Google email (optional)", "chris@gmail.com"]])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.submit(screen.getByRole("button", { name: "Add member" }).closest("form")!);
    await waitFor(() => expect(document.getElementById("email-msg")?.textContent).toBe("Another member already uses that email."));
    expect(document.getElementById("username-msg")?.textContent).not.toContain("taken");
  });
});
