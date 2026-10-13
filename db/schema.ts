import { index, integer, primaryKey, sqliteTable, text,uniqueIndex } from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

// Feasibility-only records. No student uploads are accepted by this prototype.
export const retentionProbes = sqliteTable('retention_probes', {
  id: text('id').primaryKey(),
  fileKey: text('file_key').notNull(),
  expiresAt: integer('expires_at').notNull(),
  running: integer('running').notNull().default(0),
});

export const sessions = sqliteTable('sessions', {
  stateVersion:integer('state_version').notNull().default(0),
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
  requestId:text('request_id'),requestSha256:text('request_sha256'),
}, (table) => [
  index('jobs_owner_session').on(table.owner, table.sessionId, table.createdAt),
  index('jobs_expiry').on(table.lastActivity, table.status),
  uniqueIndex('jobs_request_once').on(table.owner,table.sessionId,table.requestId).where(sql`${table.requestId} IS NOT NULL`),
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
  requestId:text('request_id'),requestSha256:text('request_sha256'),
},table=>[index('local_stata_tasks_pair_status').on(table.pairingId,table.status,table.createdAt),uniqueIndex('local_stata_tasks_request_once').on(table.owner,table.sessionId,table.requestId).where(sql`${table.requestId} IS NOT NULL`)]);

export const accounts=sqliteTable('accounts',{id:text('id').primaryKey(),username:text('username').notNull().unique(),passwordHash:text('password_hash').notNull(),primaryOwner:text('primary_owner').notNull().unique(),createdAt:integer('created_at').notNull()});
export const accountOwners=sqliteTable('account_owners',{owner:text('owner').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.id),kind:text('kind').notNull(),claimedAt:integer('claimed_at').notNull()},t=>[index('account_owners_user').on(t.userId)]);
export const authSessions=sqliteTable('auth_sessions',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.id),expiresAt:integer('expires_at').notNull()},t=>[index('auth_sessions_expiry').on(t.expiresAt)]);
export const authAttempts=sqliteTable('auth_attempts',{id:text('id').primaryKey(),kind:text('kind').notNull(),source:text('source').notNull(),username:text('username').notNull(),createdAt:integer('created_at').notNull()},t=>[index('auth_attempts_window').on(t.kind,t.createdAt,t.source,t.username)]);
