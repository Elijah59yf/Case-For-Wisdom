import mysql from "mysql2/promise";

let pool;

export function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "caseforwisdom",
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    decimalNumbers: true,
  });
  return pool;
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
