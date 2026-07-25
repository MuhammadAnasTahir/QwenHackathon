"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Alarm } from "@/lib/schema";
import { EVT_TEST_ALARM } from "@/lib/schema";
import { clearOldFired, findDueAlarm, loadAlarms, logDose, markFired } from "@/lib/alarms";
import { idbGet } from "@/lib/idb";
import { RingOverlay } from "./RingOverlay";
import { nowHHMM, todayStr } from "./labels";

interface Ringing {
  alarm: Alarm;
  time: string;
  photo: string | null;
  test: boolean;
}

const POLL_MS = 20_000;
const SNOOZE_MS = 10 * 60 * 1000;

function demoAlarm(hhmm: string): Alarm {
  const now = new Date();
  return {
    id: "demo-test-alarm",
    medicine_name: "Panadol 500mg",
    salt: "paracetamol",
    photoKey: null,
    urdu_announcement: "دوا کا وقت ہو گیا ہے۔ پیناڈول کی ایک گولی کھانے کے بعد لیں۔",
    english_announcement: "It is time for your medicine. Take one tablet of Panadol after food.",
    times: [hhmm],
    start_date: todayStr(now),
    duration_days: 1,
    food: "after_food",
    taken_log: [],
    created_at: now.toISOString(),
  };
}

export function AlarmScheduler() {
  const [ringing, setRinging] = useState<Ringing | null>(null);
  const ringingRef = useRef<Ringing | null>(null);
  useEffect(() => {
    ringingRef.current = ringing;
  }, [ringing]);
  const snoozeTimer = useRef<number | null>(null);
  const testTimer = useRef<number | null>(null);

  const openRing = useCallback(async (alarm: Alarm, time: string, test: boolean) => {
    let photo: string | null = null;
    if (alarm.photoKey) {
      try {
        photo = await idbGet(alarm.photoKey);
      } catch {
        photo = null;
      }
    }
    setRinging({ alarm, time, photo, test });

    // Tier 2: if the tab is hidden, also surface a system notification via the SW.
    if (
      typeof document !== "undefined" &&
      document.hidden &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          reg?.showNotification("صحت ساتھی — دوا کا وقت", {
            body: `${alarm.medicine_name} — ${alarm.urdu_announcement}`,
            icon: "/icon.svg",
            tag: `ss-${alarm.id}-${time}`,
          });
        })
        .catch(() => {});
    }
  }, []);

  // The 20-second poll for due alarms.
  useEffect(() => {
    clearOldFired();
    const check = () => {
      if (ringingRef.current) return; // one ring at a time
      let due: { alarm: Alarm; time: string } | null = null;
      try {
        due = findDueAlarm(new Date());
      } catch {
        due = null;
      }
      if (due) void openRing(due.alarm, due.time, false);
    };
    check();
    const id = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(id);
  }, [openRing]);

  // "Test alarm in N seconds" — EVT_TEST_ALARM { seconds }.
  useEffect(() => {
    const onTest = (e: Event) => {
      const detail = (e as CustomEvent<{ seconds?: number }>).detail;
      const seconds = Number(detail?.seconds ?? 10);
      if (testTimer.current !== null) window.clearTimeout(testTimer.current);
      testTimer.current = window.setTimeout(
        () => {
          testTimer.current = null;
          const hhmm = nowHHMM();
          let saved: Alarm[] = [];
          try {
            saved = loadAlarms();
          } catch {
            saved = [];
          }
          const alarm = saved[0] ?? demoAlarm(hhmm);
          void openRing(alarm, hhmm, true);
        },
        Math.max(0, seconds) * 1000,
      );
    };
    window.addEventListener(EVT_TEST_ALARM, onTest);
    return () => {
      window.removeEventListener(EVT_TEST_ALARM, onTest);
      if (testTimer.current !== null) window.clearTimeout(testTimer.current);
    };
  }, [openRing]);

  // Clear a pending snooze re-ring on unmount.
  useEffect(() => {
    return () => {
      if (snoozeTimer.current !== null) window.clearTimeout(snoozeTimer.current);
    };
  }, []);

  const dismiss = useCallback(
    (status: "taken" | "snoozed") => {
      const r = ringingRef.current;
      if (!r) return;
      setRinging(null);
      if (r.test) return; // ephemeral demo ring: no logging, no re-ring

      const dateStr = todayStr();
      try {
        logDose(r.alarm.id, dateStr, r.time, status);
        markFired(r.alarm.id, dateStr, r.time);
      } catch {
        /* storage unavailable — still dismiss */
      }

      if (status === "snoozed") {
        if (snoozeTimer.current !== null) window.clearTimeout(snoozeTimer.current);
        snoozeTimer.current = window.setTimeout(() => {
          snoozeTimer.current = null;
          if (!ringingRef.current) void openRing(r.alarm, r.time, false);
        }, SNOOZE_MS);
      }
    },
    [openRing],
  );

  if (!ringing) return null;

  return (
    <RingOverlay
      alarm={ringing.alarm}
      photo={ringing.photo}
      time={ringing.time}
      onTaken={() => dismiss("taken")}
      onSnooze={() => dismiss("snoozed")}
    />
  );
}

export default AlarmScheduler;
