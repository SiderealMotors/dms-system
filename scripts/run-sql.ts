/**
 * Applies a .sql file to the database over a direct (non-pooled) connection.
 *
 * DDL needs the non-pooling URL: PgBouncer in transaction mode rejects some of
 * the statements these migrations use. The whole file runs in one transaction,
 * so a failure part-way leaves the schema untouched rather than half-migrated.
 *
 * Usage: npx tsx scripts/run-sql.ts scripts/010_accounting_compliance.sql
 */
import { readFileSync } from "node:fs"
import { Client } from "pg"

async function main() {
  const args = process.argv.slice(2)
  // Some statements (ALTER TYPE ... ADD VALUE) cannot run inside a transaction.
  const useTransaction = !args.includes("--no-transaction")
  const file = args.find((a) => !a.startsWith("--"))
  if (!file) {
    console.error(
      "usage: tsx scripts/run-sql.ts [--no-transaction] <path-to-sql>",
    )
    process.exit(1)
  }

  const connectionString =
    process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
  if (!connectionString) {
    console.error("POSTGRES_URL_NON_POOLING is not set")
    process.exit(1)
  }

  const sql = readFileSync(file, "utf8")

  // Supabase presents a self-signed chain. `sslmode` in the URL would override
  // the ssl option below, so strip it and configure TLS explicitly.
  const url = new URL(connectionString)
  url.searchParams.delete("sslmode")
  url.searchParams.delete("ssl")

  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    if (useTransaction) await client.query("BEGIN")
    await client.query(sql)
    if (useTransaction) await client.query("COMMIT")
    console.log(`applied ${file}`)
  } catch (error) {
    if (useTransaction) await client.query("ROLLBACK")
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `FAILED${useTransaction ? " (rolled back)" : " (NOT transactional; may be partially applied)"}: ${message}`,
    )
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()
