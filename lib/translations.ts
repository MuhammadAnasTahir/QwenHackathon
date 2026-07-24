// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — UI string dictionary (Urdu-first, simple 5th-grade language)
// ─────────────────────────────────────────────────────────────────────────────

export type TKey =
  | "app_name"
  | "tagline"
  | "home_alarms"
  | "home_chat"
  | "home_hint"
  | "chat_placeholder"
  | "chat_send"
  | "chat_listening"
  | "chat_tap_mic"
  | "chat_attach"
  | "chat_thinking"
  | "action_read_rx"
  | "action_check_box"
  | "action_just_ask"
  | "alarms_title"
  | "alarms_empty"
  | "alarms_add"
  | "alarms_test"
  | "alarm_taken"
  | "alarm_snooze"
  | "alarm_ring_title"
  | "add_photo"
  | "medicine_name"
  | "times_label"
  | "duration_label"
  | "food_before"
  | "food_after"
  | "food_empty"
  | "food_milk"
  | "food_any"
  | "freq_once"
  | "freq_twice"
  | "freq_thrice"
  | "freq_four"
  | "freq_bedtime"
  | "freq_needed"
  | "morning"
  | "noon"
  | "evening"
  | "night"
  | "save"
  | "cancel"
  | "delete"
  | "confirm_schedule"
  | "confirm_yes"
  | "confirm_retake"
  | "disclaimer"
  | "red_flag_banner"
  | "call_1122"
  | "verify_match"
  | "verify_mismatch"
  | "verify_unsure"
  | "expired_warning"
  | "error_generic"
  | "error_offline"
  | "speak_screen"
  | "language_toggle"
  | "extract_review_title"
  | "extract_low_confidence"
  | "dev_panel_title"
  | "adherence_title";

export const translations: Record<TKey, { ur: string; en: string }> = {
  app_name: { ur: "صحت ساتھی", en: "Sehat Saathi" },
  tagline: { ur: "آپ کی دوا کا ساتھی", en: "Your medicine companion" },

  home_alarms: { ur: "دوا کے الارم", en: "Medicine Alarms" },
  home_chat: { ur: "بات کریں", en: "Chat" },
  home_hint: {
    ur: "نسخے کی تصویر لیں یا بول کر پوچھیں۔ ہم آپ کو آسان اردو میں بتائیں گے۔",
    en: "Take a photo of your prescription or ask by voice. We will explain in simple words.",
  },

  chat_placeholder: { ur: "اپنا سوال لکھیں یا بولیں…", en: "Type or speak your question…" },
  chat_send: { ur: "بھیجیں", en: "Send" },
  chat_listening: { ur: "سن رہے ہیں…", en: "Listening…" },
  chat_tap_mic: { ur: "بولنے کے لیے مائیک دبائیں", en: "Tap the mic to speak" },
  chat_attach: { ur: "تصویر لگائیں", en: "Attach a photo" },
  chat_thinking: { ur: "سوچ رہے ہیں…", en: "Thinking…" },

  action_read_rx: { ur: "نسخہ پڑھیں", en: "Read prescription" },
  action_check_box: { ur: "دوا چیک کریں", en: "Check this medicine" },
  action_just_ask: { ur: "بس سوال پوچھیں", en: "Just ask a question" },

  alarms_title: { ur: "دوا کے الارم", en: "Medicine Alarms" },
  alarms_empty: { ur: "ابھی کوئی الارم نہیں ہے", en: "No alarms yet" },
  alarms_add: { ur: "نیا الارم", en: "Add alarm" },
  alarms_test: { ur: "الارم آزمائیں", en: "Test alarm" },
  alarm_taken: { ur: "لے لی", en: "Taken" },
  alarm_snooze: { ur: "بعد میں", en: "Later" },
  alarm_ring_title: { ur: "دوا کا وقت ہو گیا ہے", en: "Time for your medicine" },

  add_photo: { ur: "تصویر لیں", en: "Add photo" },
  medicine_name: { ur: "دوا کا نام", en: "Medicine name" },
  times_label: { ur: "وقت", en: "Times" },
  duration_label: { ur: "کتنے دن؟", en: "For how many days" },

  food_before: { ur: "کھانے سے پہلے", en: "Before food" },
  food_after: { ur: "کھانے کے بعد", en: "After food" },
  food_empty: { ur: "خالی پیٹ", en: "Empty stomach" },
  food_milk: { ur: "دودھ کے ساتھ", en: "With milk" },
  food_any: { ur: "کسی بھی وقت", en: "Any time" },

  freq_once: { ur: "دن میں ایک بار", en: "Once a day" },
  freq_twice: { ur: "دن میں دو بار", en: "Twice a day" },
  freq_thrice: { ur: "دن میں تین بار", en: "Three times a day" },
  freq_four: { ur: "دن میں چار بار", en: "Four times a day" },
  freq_bedtime: { ur: "سوتے وقت", en: "At bedtime" },
  freq_needed: { ur: "ضرورت کے وقت", en: "When needed" },

  morning: { ur: "صبح", en: "Morning" },
  noon: { ur: "دوپہر", en: "Noon" },
  evening: { ur: "شام", en: "Evening" },
  night: { ur: "رات", en: "Night" },

  save: { ur: "محفوظ کریں", en: "Save" },
  cancel: { ur: "منسوخ کریں", en: "Cancel" },
  delete: { ur: "ہٹائیں", en: "Delete" },

  confirm_schedule: { ur: "کیا دوا کے یہ اوقات ٹھیک ہیں؟", en: "Is this medicine schedule correct?" },
  confirm_yes: { ur: "جی ہاں، ٹھیک ہے", en: "Yes, it is correct" },
  confirm_retake: { ur: "دوبارہ تصویر لیں", en: "Retake the photo" },

  disclaimer: {
    ur: "یہ ڈاکٹر نہیں ہے۔ دوا کے بارے میں اپنے ڈاکٹر سے ضرور پوچھیں۔",
    en: "This is not a doctor. Always ask your doctor about your medicines.",
  },
  red_flag_banner: {
    ur: "یہ خطرے کی نشانی ہو سکتی ہے۔ فوراً ہسپتال جائیں یا 1122 پر کال کریں۔",
    en: "This could be an emergency. Go to a hospital now or call 1122.",
  },
  call_1122: { ur: "‏1122 پر کال کریں", en: "Call 1122" },

  verify_match: { ur: "جی ہاں، یہ صحیح دوا ہے", en: "Yes, this is the right medicine" },
  verify_mismatch: { ur: "خبردار! یہ وہ دوا نہیں لگتی", en: "Warning! This does not look like your medicine" },
  verify_unsure: { ur: "صاف پتہ نہیں چلا۔ دوبارہ تصویر لیں", en: "Could not tell. Please retake the photo" },
  expired_warning: { ur: "یہ دوا پرانی ہو چکی ہے۔ اسے نہ کھائیں۔", en: "This medicine is expired. Do not take it." },

  error_generic: { ur: "معاف کیجیے، کچھ خرابی ہو گئی۔ دوبارہ کوشش کریں۔", en: "Sorry, something went wrong. Please try again." },
  error_offline: { ur: "انٹرنیٹ نہیں چل رہا۔ تھوڑی دیر بعد کوشش کریں۔", en: "No internet. Please try again in a while." },

  speak_screen: { ur: "سنیں", en: "Listen" },
  language_toggle: { ur: "زبان بدلیں", en: "Change language" },

  extract_review_title: { ur: "آپ کی دوائیں", en: "Your medicines" },
  extract_low_confidence: {
    ur: "یہ صاف پڑھا نہیں گیا۔ مہربانی کر کے خود چیک کریں۔",
    en: "We could not read this clearly. Please check it yourself.",
  },

  dev_panel_title: { ur: "جج موڈ", en: "Judge Mode" },
  adherence_title: { ur: "پچھلے سات دن", en: "Last 7 days" },
};
