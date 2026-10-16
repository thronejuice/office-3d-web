import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { AvatarConfig, MapData } from '@office3d/shared';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  department: text('department').notNull().default(''),
  jobTitle: text('job_title').notNull().default(''),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  disabled: boolean('disabled').notNull().default(false),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  avatar: jsonb('avatar').$type<AvatarConfig | null>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256 of the cookie token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const mapVersions = pgTable('map_versions', {
  version: serial('version').primaryKey(),
  data: jsonb('data').$type<MapData>().notNull(),
  note: text('note').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const mapDraft = pgTable('map_draft', {
  id: integer('id').primaryKey().default(1),
  data: jsonb('data').$type<MapData>().notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const missedKnocks = pgTable('missed_knocks', {
  id: serial('id').primaryKey(),
  toId: uuid('to_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromId: uuid('from_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  at: timestamp('at').notNull().defaultNow(),
});
