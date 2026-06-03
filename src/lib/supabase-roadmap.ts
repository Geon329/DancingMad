export type PersistenceDriver = "localStorage" | "supabase";

export const activePersistenceDriver: PersistenceDriver = "localStorage";

export const supabaseTables = [
  "boards",
  "users",
  "messages",
  "assets",
  "board_snapshots"
] as const;

// Supabase will replace the localStorage functions in storage.ts once the
// database project exists. Keeping reads/writes behind lib functions now keeps
// the UI components from learning about the eventual database client.
