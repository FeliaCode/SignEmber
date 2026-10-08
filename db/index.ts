import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";

const g = globalThis as unknown as { __emberPool?: Pool };
const pool = (g.__emberPool ??= new Pool({ connectionString: env.databaseUrl, max: 8 }));

export const db = drizzle(pool, { schema });
export { schema };
