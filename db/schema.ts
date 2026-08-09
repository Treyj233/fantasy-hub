import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sleeperConnections = sqliteTable("sleeper_connections", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  sleeperUserId: text("sleeper_user_id").notNull(),
  sleeperUsername: text("sleeper_username").notNull(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
