import { sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sleeperConnections = sqliteTable("sleeper_connections", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  sleeperUserId: text("sleeper_user_id").notNull(),
  sleeperUsername: text("sleeper_username").notNull(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const managedLeagues = sqliteTable("managed_leagues", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  identifierType: text("identifier_type").notNull(),
  identifier: text("identifier").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("managed_leagues_user_provider_identifier").on(table.userId, table.provider, table.identifierType, table.identifier),
]);
