import { MarkAsRead, NotificationFeed } from "@knocklabs/react";
import {
  NotificationProviders,
  NotificationsEmptyState,
  useNotificationFeedProps,
  type KnockConfig,
} from "~/components/notification-feed";

// ─── The Feed page ───
// The whole Feed, for going back through the record — the panel is for reading
// without leaving the page you are on. Both render from notification-feed.tsx,
// so the cell, the empty state, the relative times and the click behaviour are
// the same on both and cannot drift apart.

export function NotificationFeedPage({
  config,
  userId,
}: {
  config: KnockConfig;
  userId: number;
}) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="mt-1 text-muted-foreground">
          Everything Cadence has told you, newest first.
        </p>
      </div>

      <NotificationProviders config={config} userId={userId}>
        {/* Knock's feed is `height: 100%` over a scrolling list, so it needs a
            parent with a height of its own to scroll inside. */}
        <div className="min-h-96 flex-1 overflow-hidden rounded-lg border bg-card">
          <PageFeed />
        </div>
      </NotificationProviders>
    </div>
  );
}

function PageFeed() {
  const feedProps = useNotificationFeedProps();

  return (
    <NotificationFeed
      {...feedProps}
      // Knock's own header repeats the page's heading and adds a status
      // filter nothing asked for; keep only "Mark all as read", as the panel
      // does. The Feed itself still has no way to archive or delete.
      renderHeader={() => <FeedHeader />}
      // Room to explain properly here, where the panel has to be brief.
      EmptyComponent={<NotificationsEmptyState />}
    />
  );
}

function FeedHeader() {
  return (
    <header className="flex items-center justify-end px-4 py-2">
      <MarkAsRead />
    </header>
  );
}
