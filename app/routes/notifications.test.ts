import { describe, expect, it, vi } from "vitest";
import { RouterContextProvider, isRouteErrorResponse } from "react-router";
import { z } from "zod";
import routeConfig from "../routes";
import { NOTIFICATIONS_PATH } from "~/components/notification-feed";
import { setCurrentUserId } from "~/lib/session";
import { loader } from "./notifications";
import type { Route } from "./+types/notifications";

const appLayout = routeConfig.find(
  (entry) => entry.file === "routes/layout.app.tsx"
);

/** A request for the Feed page, from a signed-in Student. */
async function requestFrom(userId: number) {
  const setCookie = await setCurrentUserId(
    new Request("http://cadence.test/"),
    userId
  );

  return new Request("http://cadence.test/notifications", {
    headers: { Cookie: setCookie.split(";")[0] },
  });
}

/** What the framework hands a loader, around the request under test. */
function loaderArgs(request: Request): Route.LoaderArgs {
  return {
    request,
    params: {},
    context: new RouterContextProvider(),
    url: new URL(request.url),
    pattern: NOTIFICATIONS_PATH,
  };
}

/**
 * The status a thrown route response carried, or null for anything else. A
 * loader that throws `data(…)` throws it unconverted outside the framework,
 * so the status sits in the response init it was given.
 */
const thrownData = z.object({ init: z.object({ status: z.number() }) });

function thrownStatus(error: unknown): number | null {
  if (isRouteErrorResponse(error)) return error.status;
  if (error instanceof Response) return error.status;

  const parsed = thrownData.safeParse(error);

  return parsed.success ? parsed.data.init.status : null;
}

describe("the Feed page's route", () => {
  it("is registered at the path the panel's See all link leads to", () => {
    const paths = (appLayout?.children ?? []).map((child) => child.path);

    expect(paths).toContain(NOTIFICATIONS_PATH.slice(1));
  });

  it("sits inside the app layout, so the page keeps the sidebar it opened from", () => {
    expect(appLayout).toBeDefined();
  });
});

describe("the Feed page's loader", () => {
  it("has no page to show without Knock, the way the bell is absent without it", async () => {
    vi.stubEnv("KNOCK_PUBLIC_API_KEY", "");
    vi.stubEnv("KNOCK_FEED_CHANNEL_ID", "");

    const error = await loader(loaderArgs(await requestFrom(5))).catch(
      (thrown: unknown) => thrown
    );

    expect(thrownStatus(error)).toBe(404);
    vi.unstubAllEnvs();
  });

  it("turns nobody away over access: a Student whose Enrollment ended keeps their Feed", async () => {
    vi.stubEnv("KNOCK_PUBLIC_API_KEY", "pk_test_123");
    vi.stubEnv("KNOCK_FEED_CHANNEL_ID", "feed-1");

    // Nothing enrolls this Student, and nothing has to: the Feed is their
    // record of what happened, and losing access must not rewrite it.
    const loaderData = await loader(loaderArgs(await requestFrom(5)));

    expect(loaderData).toEqual({
      knock: { publicApiKey: "pk_test_123", feedChannelId: "feed-1" },
      userId: 5,
    });
    vi.unstubAllEnvs();
  });

  it("has no Feed to show when nobody is signed in", async () => {
    vi.stubEnv("KNOCK_PUBLIC_API_KEY", "pk_test_123");
    vi.stubEnv("KNOCK_FEED_CHANNEL_ID", "feed-1");

    const error = await loader(
      loaderArgs(new Request("http://cadence.test/notifications"))
    ).catch((thrown: unknown) => thrown);

    expect(thrownStatus(error)).toBe(401);
    vi.unstubAllEnvs();
  });
});
