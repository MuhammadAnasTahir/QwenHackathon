"use client";

import { SpeakButton } from "./SpeakButton";
import { isArabicScript } from "./labels";

export interface ChatMessageProps {
  role: "user" | "assistant";
  text: string;
  image?: string | null;
}

export function ChatMessage({ role, text, image }: ChatMessageProps) {
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
          <p
            dir={urduText ? "rtl" : "auto"}
            className={`whitespace-pre-wrap text-lg ${
              urduText ? "font-urdu leading-loose" : "leading-relaxed"
            }`}
          >
            {text}
          </p>
        ) : null}
        {!isUser && text ? (
          <div className="mt-2 flex justify-end">
            <SpeakButton
              text={text}
              lang={urduText ? "ur" : "en"}
              className="h-12 w-12 text-xl"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ChatMessage;
