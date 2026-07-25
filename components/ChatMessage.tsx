"use client";

import { isArabicScript } from "./labels";

export interface ChatMessageProps {
  role: "user" | "assistant";
  text: string;
  image?: string | null;
  /** True when the user sent this turn via the mic (a "voice message"). */
  viaVoice?: boolean;
}

export function ChatMessage({ role, text, image, viaVoice = false }: ChatMessageProps) {
  const isUser = role === "user";
  const urduText = isArabicScript(text);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? "rounded-ee-md bg-emerald-600 text-white"
            : "rounded-ss-md border border-stone-100 bg-white text-stone-800"
        }`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="mb-2 max-h-64 w-auto max-w-full rounded-xl object-contain"
          />
        ) : null}
        {text ? (
          <div className="flex items-start gap-2">
            {viaVoice ? (
              <span
                aria-hidden="true"
                className="mt-1 flex-shrink-0 text-base opacity-80"
                title="Voice message"
              >
                🎤
              </span>
            ) : null}
            <p
              dir={urduText ? "rtl" : "auto"}
              className={`flex-1 whitespace-pre-wrap text-lg ${
                urduText ? "font-urdu leading-loose" : "leading-relaxed"
              }`}
            >
              {text}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ChatMessage;
