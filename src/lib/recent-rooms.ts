const KEY = "relay:recent-rooms";
export type RecentRoom = { code: string; title: string; at: number };

export function readRecentRooms(): RecentRoom[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentRoom[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function rememberRoom(room: { code: string; title: string }) {
  try {
    const list = readRecentRooms().filter((r) => r.code !== room.code);
    list.unshift({ ...room, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    // ignore
  }
}

const NAME_KEY = "relay:display-name";
export function readDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
export function saveDisplayName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}
