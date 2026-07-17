export const intentKeys = ["diet", "weight", "ketone", "exercise", "sleep", "health_faq"] as const;

export type IntentKey = (typeof intentKeys)[number];

export type IntentPlan = {
  [K in IntentKey]: boolean;
} & {
  [K in `${IntentKey}_content`]: string | null;
};

const contentKeys = intentKeys.map((key) => `${key}_content` as const);
const allKeys = [...intentKeys, ...contentKeys];

export function isIntentPlan(value: unknown): value is IntentPlan {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== allKeys.length || keys.some((key) => !allKeys.includes(key as (typeof allKeys)[number]))) return false;

  for (const key of intentKeys) {
    const enabled = value[key];
    const content = value[`${key}_content`];
    if (typeof enabled !== "boolean") return false;
    if (enabled ? typeof content !== "string" : content !== null) return false;
  }
  return true;
}

export function parseIntentPlan(text: string): IntentPlan {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(normalized);
  if (!isIntentPlan(parsed)) throw new Error("Intent plan does not match the required schema.");
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
