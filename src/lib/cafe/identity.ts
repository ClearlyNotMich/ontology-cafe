// Browser-only helpers: call from effects or event handlers, never during SSR.

const NAME_KEY = "ontology-cafe:name";
const playerKey = (roomId: string) => `ontology-cafe:player:${roomId}`;

export const getSavedName = () => localStorage.getItem(NAME_KEY) ?? "";
export const saveName = (name: string) => localStorage.setItem(NAME_KEY, name);
export const getPlayerId = (roomId: string) => localStorage.getItem(playerKey(roomId));
export const savePlayerId = (roomId: string, id: string) =>
  localStorage.setItem(playerKey(roomId), id);

/** crypto.randomUUID only exists in secure contexts; phones on a LAN IP over http are not. */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function" && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
