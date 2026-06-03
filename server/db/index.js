// Adapter selector. Reads DB_ADAPTER and exports a single `db` object
// whose methods match the interface documented in CLAUDE.md.

const adapterName = (process.env.DB_ADAPTER || "mariadb").toLowerCase();

let mod;
if (adapterName === "supabase") {
  mod = await import("./adapters/supabase.js");
} else if (adapterName === "mariadb") {
  mod = await import("./adapters/mariadb.js");
} else {
  throw new Error(`Unknown DB_ADAPTER: ${adapterName}`);
}

export const db = mod.default;
export const adapter = adapterName;

// Clean shutdown hook. Only the MariaDB adapter holds a pool that must be
// drained; the Supabase client is stateless HTTP.
export async function closeDb() {
  if (adapterName === "mariadb") {
    const { closePool } = await import("./mariadb-pool.js");
    await closePool();
  }
}
