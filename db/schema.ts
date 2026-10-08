import { pgTable, text, uuid, timestamp, numeric, boolean, bigint, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull().unique(), // owner wallet, base58
  handle: text("handle").unique(),
  askAboveUsd: numeric("ask_above_usd", { precision: 12, scale: 6 }).notNull().default("0.05"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentWallets = pgTable("agent_wallets", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull().unique(),
  encKey: text("enc_key").notNull(), // AES-256-GCM(iv|tag|ciphertext), base64
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceUsd: numeric("price_usd", { precision: 12, scale: 6 }).notNull(),
    prompt: text("prompt").notNull(),
    active: boolean("active").notNull().default(true),
    worldId: uuid("world_id"), // optional: the Playground world this service is a stall in
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("services_user_slug").on(t.userId, t.slug)],
);

// kind: seller | agent
// status: awaiting_confirm -> funding -> paying -> done | cancelled | failed
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    via: text("via").notNull().default("chat"), // chat | api | mcp
    url: text("url"),
    host: text("host"),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    amountUsdc: bigint("amount_usdc", { mode: "number" }).notNull(),
    payTo: text("pay_to"),
    status: text("status").notNull(),
    reason: text("reason"),
    request: jsonb("request"), // what will be sent (method/body/input); never secrets
    spendTx: text("spend_tx"),
    settleTx: text("settle_tx"),
    resultExcerpt: text("result_excerpt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_user_created").on(t.userId, t.createdAt)],
);

export const earnings = pgTable("earnings", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  payerAddress: text("payer_address").notNull(),
  payerUserId: uuid("payer_user_id").references(() => users.id, { onDelete: "set null" }),
  amountUsdc: bigint("amount_usdc", { mode: "number" }).notNull(),
  settleTx: text("settle_tx").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const allowlist = pgTable(
  "allowlist",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    host: text("host").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.host] })],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_user_created").on(t.userId, t.createdAt)],
);

// API keys for an owner's own agent (REST) or an MCP client. Only the sha256 is stored.
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(), // first 12 chars, shown in the dashboard
  keyHash: text("key_hash").notNull().unique(),
  scope: text("scope").notNull().default("pay"), // pay | read
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- Playground (D15)
export const worlds = pgTable("worlds", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // null = system world (the Harbor)
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// status: open -> paid | closed
export const worldTasks = pgTable("world_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  rewardUsdc: bigint("reward_usdc", { mode: "number" }).notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// status: submitted -> paid | rejected
export const worldSubmissions = pgTable("world_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => worldTasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // the solver's owner
  result: text("result").notNull(),
  status: text("status").notNull().default("submitted"),
  payTx: text("pay_tx"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// the live feed of a world: entered, bought, submitted, paid
export const worldEvents = pgTable(
  "world_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    usdc: bigint("usdc", { mode: "number" }),
    tx: text("tx"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("world_events_world_created").on(t.worldId, t.createdAt)],
);
