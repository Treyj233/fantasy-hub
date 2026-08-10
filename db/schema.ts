import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const seasonNarrativeSnapshots = sqliteTable("season_narrative_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  leagueId: text("league_id").notNull(),
  season: text("season").notNull(),
  week: integer("week").notNull(),
  playoffProbability: real("playoff_probability"),
  rosterValueIndex: real("roster_value_index"),
  injuryCount: integer("injury_count").notNull().default(0),
  record: text("record").notNull(),
  pointsFor: real("points_for").notNull().default(0),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("season_narrative_user_league_season_week").on(table.userId, table.leagueId, table.season, table.week),
]);

export const decisionMemory = sqliteTable("decision_memory", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  leagueId: text("league_id").notNull(),
  week: integer("week").notNull(),
  category: text("category").notNull(),
  recommendation: text("recommendation").notNull(),
  alternativesJson: text("alternatives_json").notNull().default("[]"),
  informationJson: text("information_json").notNull().default("{}"),
  confidence: real("confidence").notNull(),
  userSelection: text("user_selection"),
  resultJson: text("result_json"),
  processGrade: text("process_grade"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("decision_memory_user_league_id").on(table.userId, table.leagueId, table.id),
]);
