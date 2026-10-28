/** Fail closed: a secret alone must never enable billable inference. */
/** @param {{ apiKey?: string, callsEnabled?: string }} options */
export function shouldCallMeta({ apiKey, callsEnabled }) {
  return Boolean(apiKey) && callsEnabled === "true";
}
