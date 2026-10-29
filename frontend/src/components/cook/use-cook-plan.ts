"use client";

import { useRef, useState } from "react";
import { ApiError, api as browserApi, type Api, type CookPlan } from "@/lib/api";

export type PlanState =
  | { status: "closed" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; plan: CookPlan };

/** What the cook is told when a plan can't be had. The server's own message where it is written for people. */
function explain(e: unknown): string {
  if (!(e instanceof ApiError)) return "Couldn’t plan the evening. Try again.";
  if (e.code === "ai_disabled") return "Planning needs an AI provider, and this Recipe Box doesn’t have one set up.";
  if (e.code === "not_found") return "One of these recipes is no longer in the box. Go back to the recipes and choose again.";
  if (["network", "api_unreachable", "rate_limited", "ai_error"].includes(e.code)) return e.message;
  return "Couldn’t plan the evening. Try again.";
}

/**
 * Asks the API for a suggested order (POST /api/cook/plan) and holds it for the preview. A request still running when the cook
 * closes the panel or asks again is ignored when it answers.
 */
export function useCookPlan(ids: readonly string[], api: Pick<Api, "planCook"> = browserApi) {
  const [state, setState] = useState<PlanState>({ status: "closed" });
  const asked = useRef(0);

  const request = async () => {
    const mine = ++asked.current;
    setState({ status: "loading" });
    try {
      const plan = await api.planCook([...ids]);
      if (mine === asked.current) setState({ status: "ready", plan });
    } catch (e) {
      if (mine === asked.current) setState({ status: "error", message: explain(e) });
    }
  };
  const close = () => {
    asked.current++;
    setState({ status: "closed" });
  };
  return { state, request: () => void request(), close };
}
