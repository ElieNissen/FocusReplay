import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const state = sqliteTable("state", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
});
export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});
