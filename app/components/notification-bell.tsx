import { useRef, useState, type RefObject } from "react";
import { Link } from "react-router";
import { Bell } from "lucide-react";
import {
  MarkAsRead,
  NotificationFeedPopover,
  formatBadgeCount,
  useKnockFeed,
  useNotificationStore,
} from "@knocklabs/react";
import { cn } from "~/lib/utils";
import {
  NOTIFICATIONS_PATH,
  NotificationProviders,
  useNotificationFeedProps,
  type KnockConfig,
} from "~/components/notification-feed";

// ─── The notification bell ───
// Cadence's own sidebar item — our icon, our label, our styling — so it is in
// the server-rendered page and never goes missing. Only the unread count
// arrives after hydration, and a quiet bell carries no count at all.

export function NotificationBell({
  config,
  userId,
}: {
  config: KnockConfig;
  userId: number;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <NotificationProviders config={config} userId={userId}>
      {/* Zero-size anchor: the popover is a sibling of the nav items until
          Popper lifts it out of the rail, and must not take space in it. */}
      <div className="relative">
        <BellButton
          buttonRef={buttonRef}
          open={open}
          onToggle={() => setOpen((wasOpen) => !wasOpen)}
        />
        <NotificationPanel open={open} onClose={() => setOpen(false)} buttonRef={buttonRef} />
      </div>
    </NotificationProviders>
  );
}

function BellButton({
  buttonRef,
  open,
  onToggle,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onToggle: () => void;
}) {
  const { feedClient } = useKnockFeed();
  // Unread, never Knock's "unseen" default: the count is what a Student has
  // not dealt with, not what has merely crossed their screen.
  const unreadCount = useNotificationStore(
    feedClient,
    (state) => state.metadata.unread_count
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        open
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Bell className="size-4" aria-hidden="true" />
      Notifications
      {unreadCount > 0 && (
        <span
          aria-label={`${unreadCount} unread`}
          className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-primary-foreground"
        >
          {formatBadgeCount(unreadCount)}
        </span>
      )}
    </button>
  );
}

function NotificationPanel({
  open,
  onClose,
  buttonRef,
}: {
  open: boolean;
  onClose: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const feedProps = useNotificationFeedProps({ onNavigate: onClose });

  return (
    <NotificationFeedPopover
      {...feedProps}
      buttonRef={buttonRef}
      isVisible={open}
      onClose={onClose}
      // Popper's fixed strategy is what lets a 400px panel out of the 56-wide
      // rail and past the layout's clipping.
      placement="right-start"
      renderHeader={() => <PanelHeader onSeeAll={onClose} />}
    />
  );
}

function PanelHeader({ onSeeAll }: { onSeeAll: () => void }) {
  return (
    <header className="flex items-center justify-between gap-2 px-4 py-2">
      <span className="text-sm font-semibold">Notifications</span>
      <div className="flex items-center gap-3">
        {/* Opening the panel marks nothing; clearing the count is deliberate. */}
        <MarkAsRead />
        <Link
          to={NOTIFICATIONS_PATH}
          onClick={onSeeAll}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
        >
          See all
        </Link>
      </div>
    </header>
  );
}
