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

export const accountIdentities = sqliteTable("account_identities", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  canonicalUserId: text("canonical_user_id").notNull(),
  verifiedEmail: text("verified_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("account_identities_provider_user").on(table.provider, table.providerUserId),
]);

export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  colorMode: text("color_mode").notNull().default("light"),
  teamTheme: text("team_theme").notNull().default("GB"),
  badgeTheme: text("badge_theme").notNull().default("arcade"),
  leagueOrderJson: text("league_order_json").notNull().default("[]"),
  hiddenLeagueIdsJson: text("hidden_league_ids_json").notNull().default("[]"),
  pushPreferencesJson: text("push_preferences_json").notNull().default("{}"),
  onboardingCompletedAt: text("onboarding_completed_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rivalryPreferences = sqliteTable("rivalry_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  leagueId: text("league_id").notNull(),
  rosterIdsJson: text("roster_ids_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("rivalry_preferences_user_league").on(table.userId, table.leagueId),
]);

export const subscriptions = sqliteTable("subscriptions", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("inactive"),
  provider: text("provider").notNull().default("manual"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  currentPeriodEnd: text("current_period_end"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appStoreTransactions = sqliteTable("app_store_transactions", {
  originalTransactionId: text("original_transaction_id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  userId: text("user_id").notNull(),
  productId: text("product_id").notNull(),
  environment: text("environment").notNull(),
  expiresAt: text("expires_at"),
  revokedAt: text("revoked_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("app_store_transactions_transaction_id").on(table.transactionId),
]);

export const pushDevices = sqliteTable("push_devices", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull().default("ios"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pushAlertDeliveries = sqliteTable("push_alert_deliveries", {
  eventKey: text("event_key").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pushAlertStates = sqliteTable("push_alert_states", {
  stateKey: text("state_key").primaryKey(),
  userId: text("user_id").notNull(),
  leagueKey: text("league_key").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("push_alert_states_user_league").on(table.userId, table.leagueKey),
]);

export const managedLeagues = sqliteTable("managed_leagues", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  identifierType: text("identifier_type").notNull(),
  identifier: text("identifier").notNull(),
  rosterId: text("roster_id"),
  leagueName: text("league_name"),
  season: text("season"),
  leagueMetaJson: text("league_meta_json").notNull().default("{}"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("managed_leagues_user_provider_identifier").on(table.userId, table.provider, table.identifierType, table.identifier),
]);

export const espnSyncPairings = sqliteTable("espn_sync_pairings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("espn_sync_pairings_code_hash").on(table.codeHash),
]);

export const espnLeagueSnapshots = sqliteTable("espn_league_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  leagueId: text("league_id").notNull(),
  season: text("season").notNull(),
  payloadJson: text("payload_json").notNull(),
  syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("espn_league_snapshots_user_league_season").on(table.userId, table.leagueId, table.season),
]);

export const leagueDataSnapshots = sqliteTable("league_data_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  leagueKey: text("league_key").notNull(),
  payloadJson: text("payload_json").notNull(),
  refreshedAt: text("refreshed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("league_data_snapshots_user_league").on(table.userId, table.leagueKey),
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
