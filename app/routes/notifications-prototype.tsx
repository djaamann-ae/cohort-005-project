/**
 * PROTOTYPE — throwaway route for wayfinder ticket #8, variant C.
 *
 * Variant C's premise is that the feed is a destination you navigate to,
 * not a panel you peek at. That only reads honestly as a real page inside
 * the real app chrome, so it gets a real (throwaway) route.
 */
import { useNotifPrototype, NotificationsPage } from "~/components/notification-prototype";

export default function NotificationsPrototypeRoute() {
  const { feed } = useNotifPrototype();
  return <NotificationsPage feed={feed} />;
}
