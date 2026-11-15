import type { KnockConfig } from "~/components/notification-feed";

/**
 * The public half of Knock's configuration, on its way to the browser — there
 * is no other route for an environment variable to get there.
 *
 * Both halves or nothing: without either one the Feed cannot load, and Cadence
 * is better off with no bell and no Feed page than with dead ones.
 */
export function getKnockConfig(): KnockConfig | null {
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;

  if (!publicApiKey || !feedChannelId) return null;

  return { publicApiKey, feedChannelId };
}
