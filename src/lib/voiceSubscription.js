export const DEFAULT_VOICE_SUBSCRIPTION = {
  enabled: true,
  monthlyPrice: "₹499",
  yearlyPrice: "₹4,999",
  monthlyPeriod: "/ month",
  yearlyPeriod: "/ year",
  currency: "INR",
  discountBadge: "Save 20% · 2 Months Free",
  headline: "VikaTech Voice Intelligence",
  subheadline: "Control your entire home with natural voice commands. Choose the subscription that fits your space.",
  monthlyFeatures: [
    "Unlimited natural voice commands",
    "Real-time room & device control",
    "Custom schedule & alarm routines",
    "Local mesh offline voice fallback",
    "Mobile web & desktop voice mic",
  ],
  yearlyFeatures: [
    "Everything in Monthly Plan",
    "2 Months completely free",
    "Priority Sarvam AI neural processing",
    "Multi-room synchronized voice routines",
    "VIP 24/7 dedicated engineering support",
  ],
};

const STORAGE_KEY = "vikatech_voice_subscription_settings";

export function getLocalVoiceSubscription() {
  if (typeof window === "undefined") return DEFAULT_VOICE_SUBSCRIPTION;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_SUBSCRIPTION;
    return { ...DEFAULT_VOICE_SUBSCRIPTION, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VOICE_SUBSCRIPTION;
  }
}

export function setLocalVoiceSubscription(settings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("vk:voice-subscription-change", { detail: settings }));
  } catch {}
}
