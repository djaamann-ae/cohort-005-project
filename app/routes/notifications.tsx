import { data } from "react-router";
import type { Route } from "./+types/notifications";
import { NotificationFeedPage } from "~/components/notification-feed-page";
import { requireUserId } from "~/lib/access.server";
import { getKnockConfig } from "~/lib/knock.server";

export function meta() {
  return [
    { title: "Notifications — Cadence" },
    { name: "description", content: "Everything Cadence has told you" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const knock = getKnockConfig();

  // Reached only from the bell, which is itself absent without Knock — so
  // without it there is no page here either, rather than a broken one.
  if (!knock) throw data("Not found", { status: 404 });

  // Nothing here asks what the Student can still reach: their Feed is the
  // record of what happened, and an Enrollment ending does not rewrite it.
  return { knock, userId };
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { knock, userId } = loaderData;

  return <NotificationFeedPage config={knock} userId={userId} />;
}
