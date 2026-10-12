import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Feasibility-only records. No student uploads are accepted by this prototype.
export const retentionProbes = sqliteTable('retention_probes', {
  id: text('id').primaryKey(),
  fileKey: text('file_key').notNull(),
  expiresAt: integer('expires_at').notNull(),
  running: integer('running').notNull().default(0),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull(),
  lastActivity: integer('last_activity').notNull(),
}, (table) => [index('sessions_owner_activity').on(table.owner, table.lastActivity)]);

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  owner: text('owner').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull(),
  inputKey: text('input_key').notNull(),
  createdAt: integer('created_at').notNull(),
  lastActivity: integer('last_activity').notNull(),
  leaseUntil: integer('lease_until').notNull().default(0),
}, (table) => [
  index('jobs_owner_session').on(table.owner, table.sessionId, table.createdAt),
  index('jobs_expiry').on(table.lastActivity, table.status),
]);

export const modelCalls = sqliteTable('model_calls', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('model_calls_owner_time').on(table.owner, table.createdAt)]);

// Drafts are separate from submitted evidence; session deletion/expiry cascades.
export const researchDrafts = sqliteTable('research_drafts', {
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  key: text('draft_key').notNull(),
  body: text('body').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [primaryKey({columns: [table.sessionId, table.key]})]);

export const modelInteractions = sqliteTable('model_interactions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, {onDelete:'cascade'}),
  owner: text('owner').notNull(),
  kind: text('kind').notNull(),
  taskId: text('task_id'),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull(),
}, table=>[index('model_interactions_session_time').on(table.sessionId,table.createdAt)]);

export const practicalMessages = sqliteTable('practical_messages', {
  id:text('id').primaryKey(),sessionId:text('session_id').notNull().references(()=>sessions.id,{onDelete:'cascade'}),
  owner:text('owner').notNull(),body:text('body').notNull(),createdAt:integer('created_at').notNull(),
}, table=>[index('practical_messages_session_time').on(table.sessionId,table.createdAt)]);
export const localPairings = sqliteTable('local_pairings', {
  id:text('id').primaryKey(),code:text('code').notNull().unique(),tokenHash:text('token_hash').notNull(),owner:text('owner'),
  sessionId:text('session_id').references(()=>sessions.id,{onDelete:'cascade'}),createdAt:integer('created_at').notNull(),
  expiresAt:integer('expires_at').notNull(),lastSeen:integer('last_seen').notNull().default(0),revoked:integer('revoked').notNull().default(0),body:text('body').notNull().default('{}'),
},table=>[index('local_pairings_session').on(table.sessionId,table.owner)]);
export const localPairAttempts = sqliteTable('local_pair_attempts', {
  id:text('id').primaryKey(),owner:text('owner').notNull(),createdAt:integer('created_at').notNull(),
});
export const localStataTasks = sqliteTable('local_stata_tasks', {
  id:text('id').primaryKey(),pairingId:text('pairing_id').notNull().references(()=>localPairings.id,{onDelete:'cascade'}),
  sessionId:text('session_id').notNull().references(()=>sessions.id,{onDelete:'cascade'}),owner:text('owner').notNull(),
  status:text('status').notNull(),body:text('body').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},table=>[index('local_stata_tasks_pair_status').on(table.pairingId,table.status,table.createdAt)]);
