// Load the accepted market dataset through the ETL facade with a least-privilege account.
//   node apps/etl/src/load.ts [--account ERP_ETL] [--batch-prefix etl]
// Credentials: .local/oracle_accounts.json (local accounts) or, when ERP_ETL_USER and
// ERP_ETL_PASSWORD are set (e.g. from .local/db-accounts.env written by db/install.sh),
// those plus ERP_OWNER. Never prints the password. Re-running is idempotent: completed
// batches are reported and left alone; identical content in a new batch is SKIPPED.
import oracledb from 'oracledb';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/config.ts';
import { loadDataset, planBatches, type Artifact } from './lib/dataset.ts';

type Account = { user: string; password: string; owner: string };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function account(): Account {
  if (process.env.ERP_ETL_USER && process.env.ERP_ETL_PASSWORD && process.env.ERP_OWNER) {
    return { user: process.env.ERP_ETL_USER, password: process.env.ERP_ETL_PASSWORD, owner: process.env.ERP_OWNER };
  }
  const name = arg('account', 'ERP_ETL');
  const file = join(ROOT, '.local/oracle_accounts.json');
  if (!existsSync(file)) throw new Error('no credentials: set ERP_ETL_USER/ERP_ETL_PASSWORD/ERP_OWNER or create .local/oracle_accounts.json');
  const acc = JSON.parse(readFileSync(file, 'utf8')).accounts?.[name];
  if (!acc || acc.mode !== 'ETL') throw new Error(`${name} is not an ETL account in .local/oracle_accounts.json`);
  return { user: name, password: acc.password, owner: acc.owner_schema };
}

async function main() {
  const acc = account();
  if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(acc.owner)) throw new Error('invalid owner schema name');
  const ds = loadDataset();
  const plans = planBatches(ds);
  const prefix = arg('batch-prefix', 'etl');
  const api = `${acc.owner}.pkg_etl_api`;
  const conn = await oracledb.getConnection({ user: acc.user, password: acc.password, connectString: process.env.ORACLE_CONNECT_STRING ?? '127.0.0.1:1521/FREEPDB1' });
  conn.clientId = `etl:load:${ds.manifest.dataset_version}`;
  conn.module = 'equity-research-etl';
  console.log(`[etl:load] ${acc.user} -> ${acc.owner}, dataset ${ds.manifest.dataset_version}`);
  let failed = false;
  try {
    // 1. Artifacts (idempotent by source + hash): VNDirect files and the CafeF balance sheets.
    const ids = new Map<string, number>();
    const register = async (a: Pick<Artifact, 'source_code' | 'source_name' | 'kind' | 'sha256' | 'path' | 'url' | 'collected_at' | 'note'>) => {
      const r = await conn.execute<{ id: number }>(
        `BEGIN ${api}.register_artifact(:src, :name, :kind, :sha, :path, :url,
           CASE WHEN :ts IS NULL THEN NULL ELSE TO_TIMESTAMP_TZ(:ts, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') END, :note, :id); END;`,
        { src: a.source_code, name: a.source_name, kind: a.kind, sha: a.sha256, path: a.path, url: a.url, ts: a.collected_at, note: a.note,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      ids.set(a.sha256, Number((r.outBinds as { id: number }).id));
    };
    for (const a of ds.manifest.artifacts) await register(a);
    for (const c of ds.manifest.capital_provider_artifacts) {
      await register({ source_code: 'CAFEF', source_name: 'CAFEF', kind: 'JSON', sha256: c.sha256, path: c.path, url: c.url, collected_at: null,
        note: 'Provider balance sheet (already registered by the financial seed when present)' });
    }
    console.log(`[etl:load] artifacts registered: ${ids.size}`);

    // 2. Batches in order; each one: create -> stage (if new) -> seal -> commit -> process.
    for (const plan of plans) {
      const key = `${prefix}-${ds.manifest.dataset_version}-${plan.suffix}`;
      const created = await conn.execute(`BEGIN ${api}.create_market_batch(:k, :m, :id); END;`,
        { k: key, m: plan.mapping, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      const batchId = Number((created.outBinds as { id: number }).id);
      const status = async () => (await conn.execute<[string, number, number, number, number, number]>(
        `SELECT batch_status, received_count, imported_count, skipped_count, rejected_count, error_count FROM ${acc.owner}.v_import_batches WHERE batch_id = :b`,
        { b: batchId })).rows?.[0] ?? ['UNKNOWN', 0, 0, 0, 0, 0];
      let [state] = await status();
      if (state === 'CREATED') {
        const binds = plan.rows.map((r) => {
          const artifactId = ids.get(r.artifactSha);
          if (!artifactId) throw new Error(`artifact ${r.artifactSha.slice(0, 12)} not registered`);
          return { b: batchId, n: r.rowNo, k: r.kind, s: r.symbol, key: r.key, a: artifactId, p: r.payload };
        });
        for (let i = 0; i < binds.length; i += 500) {
          await conn.executeMany(`BEGIN ${api}.stage_market_row(:b, :n, :k, :s, :key, :a, :p); END;`, binds.slice(i, i + 500), {
            bindDefs: { b: { type: oracledb.NUMBER }, n: { type: oracledb.NUMBER }, k: { type: oracledb.STRING, maxSize: 8 },
              s: { type: oracledb.STRING, maxSize: 40 }, key: { type: oracledb.STRING, maxSize: 40 }, a: { type: oracledb.NUMBER },
              p: { type: oracledb.STRING, maxSize: 8000 } } });
        }
        await conn.execute(`BEGIN ${api}.seal_market_batch(:b); END;`, { b: batchId });
        await conn.commit();
        [state] = await status();
      }
      if (state === 'STAGED') {
        const t0 = Date.now();
        await conn.execute(`BEGIN ${api}.process_market_batch(:b); END;`, { b: batchId });
        console.log(`[etl:load]   processed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }
      const [final, received, imported, skipped, rejected, errors] = await status();
      console.log(`[etl:load] ${plan.suffix}: batch ${batchId} (${key}) ${final} received ${received} imported ${imported} skipped ${skipped} rejected ${rejected} errors ${errors}`);
      if (final !== 'COMPLETED') {
        failed = true;
        const errs = await conn.execute<[string, string, string]>(
          `SELECT item_code_raw, error_code, error_message FROM ${acc.owner}.v_import_errors WHERE batch_id = :b ORDER BY error_id`, { b: batchId });
        for (const e of errs.rows ?? []) console.error(`[etl:load]   ${e[0]} ${e[1]} ${e[2]}`);
        break; // later batches depend on this one
      }
    }
  } finally {
    await conn.close();
  }
  if (failed) process.exit(1);
}

main().catch((e) => { console.error('[etl:load] ERROR', (e as Error).message); process.exit(1); });
