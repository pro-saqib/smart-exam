import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ─── better-auth required tables ─────────────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ─── app tables ───────────────────────────────────────────────────────────────

export const subject = sqliteTable("subject", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("subject_user_idx").on(t.userId),
]);

export const mcq = sqliteTable("mcq", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  subjectId: text("subject_id")
    .notNull()
    .references(() => subject.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  // stored as JSON string: { A, B, C, D, E? }
  options: text("options").notNull(),
  correct: text("correct"),
  explanation: text("explanation"),
  solveLater: integer("solve_later", { mode: "boolean" }).notNull().default(false),
  attemptCount: integer("attempt_count").notNull().default(0),
  wrongCount: integer("wrong_count").notNull().default(0),
  lastAttemptCorrect: integer("last_attempt_correct", { mode: "boolean" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("mcq_user_idx").on(t.userId),
  index("mcq_subject_idx").on(t.subjectId),
  index("mcq_subject_id_idx").on(t.subjectId, t.id),
]);

export const attempt = sqliteTable("attempt", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  mcqId: text("mcq_id")
    .notNull()
    .references(() => mcq.id, { onDelete: "cascade" }),
  subjectId: text("subject_id")
    .notNull()
    .references(() => subject.id, { onDelete: "cascade" }),
  selected: text("selected").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  at: integer("at", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("attempt_user_idx").on(t.userId),
  index("attempt_mcq_idx").on(t.mcqId),
  index("attempt_user_mcq_idx").on(t.userId, t.mcqId),
]);

export const solveLater = sqliteTable("solve_later", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  mcqId: text("mcq_id")
    .notNull()
    .references(() => mcq.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("solve_later_user_idx").on(t.userId),
  index("solve_later_mcq_idx").on(t.mcqId),
  index("solve_later_user_mcq_idx").on(t.userId, t.mcqId),
]);
