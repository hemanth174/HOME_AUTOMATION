"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ensurePushSubscription,
  getNotificationPermission,
  playNotificationTone,
} from "@/lib/browserNotifications";

const ANNOUNCEMENT_READ_KEY = "vikatech_read_feature_announcements";

const TYPE_STYLES = {
  alarm: "bg-red-500/10 text-red-400 border-red-500/20",
  schedule: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  energy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  ghost: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  system: "bg-(--pg-brand-faint) text-(--pg-success) border-(--pg-brand-soft)",
};

function readAnnouncementIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(ANNOUNCEMENT_READ_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function FeatureNotificationBell({
  announcements = [],
  unreadCount = 0,
  open,
  onToggle,
  onClose,
  notificationPermission = "default",
  onEnableNotifications,
  mobile = false,
}) {
  const [notifications, setNotifications] = useState([]);
  const [user, setUser] = useState(null);
  const [permission, setPermission] = useState(
    notificationPermission || getNotificationPermission(),
  );
  const [readIds, setReadIds] = useState([]);
  const [pushNote, setPushNote] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const toastSeen = useRef(new Set());
  const activeInstance = Boolean(mobile) === isMobileViewport;

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setPermission(notificationPermission || getNotificationPermission());
  }, [notificationPermission]);

  useEffect(() => {
    setReadIds(readAnnouncementIds());
  }, []);

  useEffect(() => {
    if (!open) return;
    setReadIds(readAnnouncementIds());
  }, [open]);

  useEffect(() => {
    if (!activeInstance) return undefined;
    let active = true;
    let channel = null;
    let loadedFor = null;

    const start = async (sessionUser) => {
      let session = sessionUser ? { user: sessionUser } : null;
      if (!session) {
        const result = await supabase.auth.getSession();
        session = result.data.session;
      }
      if (!active || !session?.user || loadedFor === session.user.id) return;

      loadedFor = session.user.id;
      setUser(session.user);
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }

      const { data } = await supabase
        .from("user_notifications")
        .select("id, type, title, body, url, dedupe_key, data, created_at, read_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (!active) return;
      setNotifications(data || []);

      channel = supabase
        .channel(`navbar-notifications-${session.user.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "user_notifications",
            filter: `user_id=eq.${session.user.id}`,
          },
          ({ new: notification }) => {
            if (!active || !notification?.id) return;
            setNotifications((current) => [
              notification,
              ...current.filter((item) => item.id !== notification.id),
            ].slice(0, 40));

            if (
              notification.data?.silentToast ||
              notification.data?.clientOriginated ||
              toastSeen.current.has(notification.dedupe_key)
            ) {
              return;
            }
            toastSeen.current.add(notification.dedupe_key);
            window.dispatchEvent(
              new CustomEvent("show-global-toast", {
                detail: `${notification.title}: ${notification.body}`,
              }),
            );
            if (
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              playNotificationTone();
            }
          },
        )
        .subscribe();
    };

    start();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        loadedFor = null;
        setUser(null);
        setNotifications([]);
        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
        return;
      }
      if (session?.user) start(session.user);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeInstance]);

  useEffect(() => {
    if (!activeInstance || !user || permission !== "granted") return;
    ensurePushSubscription().then((result) => {
      if (!result.ok && result.reason === "vapid-public-key-missing") {
        setPushNote("Push service is not configured yet.");
      } else if (!result.ok && result.reason === "push-unsupported") {
        setPushNote("This browser does not support background push.");
      }
    });
  }, [activeInstance, user, permission]);

  useEffect(() => {
    if (
      !activeInstance ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return undefined;
    }
    const handleMessage = (event) => {
      if (event.data?.type === "vikatech-push-resubscribe") {
        ensurePushSubscription();
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [activeInstance]);

  useEffect(() => {
    if (!activeInstance || !open || !user) return;
    const unread = notifications.filter((item) => !item.read_at);
    if (!unread.length) return;
    const readAt = new Date().toISOString();
    const ids = unread.map((item) => item.id);
    setNotifications((current) =>
      current.map((item) =>
        ids.includes(item.id) ? { ...item, read_at: readAt } : item,
      ),
    );
    supabase
      .from("user_notifications")
      .update({ read_at: readAt })
      .eq("user_id", user.id)
      .in("id", ids)
      .then(() => {});
  }, [activeInstance, open, user, notifications]);

  const handleEnable = async () => {
    if (onEnableNotifications) await onEnableNotifications();
    const next = getNotificationPermission();
    setPermission(next);
    if (next === "granted") {
      playNotificationTone();
      const result = await ensurePushSubscription();
      setPushNote(
        result.ok ? "" : `Background push unavailable: ${result.reason}.`,
      );
    }
  };

  const databaseUnread = notifications.filter((item) => !item.read_at).length;
  const combinedUnread = databaseUnread + (open ? 0 : unreadCount);

  const announcementItems = announcements.map((announcement) => ({
    id: `announcement-${announcement.id}`,
    type: "system",
    title: announcement.title,
    body: announcement.message,
    url: announcement.action_url || "/",
    created_at: announcement.created_at,
    isAnnouncement: true,
    unread: !readIds.includes(announcement.id),
  }));

  const items = [
    ...notifications.map((notification) => ({
      ...notification,
      isAnnouncement: false,
      unread: !notification.read_at,
    })),
    ...announcementItems,
  ].sort(
    (left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime(),
  );

  return (
    <div className={mobile ? "relative" : "relative"}>
      <button
        type="button"
        onClick={onToggle}
        className={`relative flex items-center justify-center rounded-xl border border-border bg-card text-text-muted transition-all hover:bg-accent-bg hover:text-accent hover:border-accent/30 ${mobile ? "h-9 w-9" : "h-9 w-9"}`}
        title="Notifications"
        aria-label={`Notifications${combinedUnread ? `, ${combinedUnread} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell size={15} />
        {combinedUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--pg-error) px-1 text-[9px] font-black text-white">
            {combinedUnread > 9 ? "9+" : combinedUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`${mobile ? "fixed right-4 top-[70px] w-[min(340px,calc(100vw-32px))]" : "absolute right-0 top-full mt-2 w-[350px]"} popover-caret z-[60] rounded-2xl border border-border bg-card p-3 text-left shadow-2xl`}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-border px-2 pb-3">
            <div>
              <p className="text-sm font-black text-text">Notifications</p>
              <p className="mt-0.5 text-[10px] font-semibold text-text-muted">
                Alerts, automations and product updates
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted transition hover:bg-accent-bg hover:text-text"
              aria-label="Close notifications"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs font-semibold text-text-muted">
                No notifications yet.
              </p>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.url || "/"}
                  onClick={onClose}
                  className="rounded-xl px-2.5 py-3 transition hover:bg-accent-bg"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-1 shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${TYPE_STYLES[item.type] || TYPE_STYLES.system}`}
                    >
                      {item.type}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="block text-xs font-black text-text">
                          {item.title}
                        </span>
                        {item.unread && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--pg-brand)" />
                        )}
                      </span>
                      <span className="mt-1 block text-[11px] leading-5 text-text-muted">
                        {item.body}
                      </span>
                      <span className="mt-1.5 block text-[10px] font-semibold text-accent">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleString()
                          : ""}
                      </span>
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="mt-2 border-t border-border pt-3">
            {pushNote && (
              <p className="mb-2 px-2 text-[10px] font-semibold leading-4 text-amber-400">
                {pushNote}
              </p>
            )}
            {permission === "granted" ? (
              <p className="flex items-center gap-1.5 px-2 text-[10px] font-semibold text-text-muted">
                <CheckCheck size={12} className="text-(--pg-success)" />
                Browser notifications are enabled on this device.
              </p>
            ) : permission === "denied" || permission === "unsupported" ? (
              <p className="px-2 text-[10px] font-semibold leading-4 text-text-muted">
                {permission === "unsupported"
                  ? "Browser notifications are not supported here."
                  : "Browser notifications are blocked. Allow them in your browser settings."}
              </p>
            ) : (
              <button
                type="button"
                onClick={handleEnable}
                className="w-full rounded-xl border border-accent/30 bg-accent-bg px-3 py-2.5 text-left text-[11px] font-extrabold text-accent transition hover:border-accent/60"
              >
                Enable browser notifications and background alerts
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
