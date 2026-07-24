"use client";

import { useEffect } from "react";
import { initAudio } from "@/lib/speech";

/**
 * Invisible bootstrapper mounted once in the root layout.
 * - Registers the service worker in PRODUCTION only (never on localhost dev —
 *   SW caching fights Next.js hot reload and eats the first few clicks).
 * - On the first user tap: unlocks the AudioContext (browsers block audio
 *   until a gesture). Notification permission is deferred and requested lazily
 *   when the user actually creates their first alarm, so it never steals a tap.
 */
export default function PwaSetup() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Only register the SW in production builds. In dev on localhost, SW
    // aggressively caches HMR chunks and pre-hydration HTML, which manifests
    // to the user as "I have to click 10 times for one click to register".
    if (
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best-effort; alarms still work in the foreground.
      });
    }

    // Unlock the WebAudio context on the first user gesture. We DON'T request
    // Notification permission here — that prompt is modal and would consume
    // the click that triggered us. Permission is requested lazily on the
    // Alarms page when the user actually needs notifications.
    const onFirstPointerDown = () => {
      window.removeEventListener("pointerdown", onFirstPointerDown);
      try {
        initAudio();
      } catch {
        // Audio unlock is best-effort.
      }
    };

    window.addEventListener("pointerdown", onFirstPointerDown);
    return () => window.removeEventListener("pointerdown", onFirstPointerDown);
  }, []);

  return null;
}
