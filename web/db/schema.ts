import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const state = sqliteTable('state', {
  id: text('id').primaryKey(),
  value: text('value').notNull(),
});
export const attempts = sqliteTable('attempts', {
  id: text('id').primaryKey(),
  count: integer('count').notNull(),
  expires: integer('expires').notNull(),
});
export const socialProfiles = sqliteTable(
  'social_profiles',
  {
    profile: text('profile').primaryKey(),
    name: text('name').notNull(),
    discoverable: integer('discoverable').notNull().default(0),
    publicActivity: integer('public_activity').notNull().default(0),
    publicPreview: integer('public_preview').notNull().default(0),
    previews: text('previews').notNull().default('[]'),
    lastSession: text('last_session').notNull().default('null'),
    status: text('status').notNull().default('offline'),
    updated: integer('updated').notNull().default(0),
    days: text('days').notNull().default('[]'),
    software: text('software').notNull().default(''),
  },
  (t) => [index('social_directory').on(t.discoverable, t.profile)],
);
export const socialFriends = sqliteTable(
  'social_friends',
  {
    a: text('a').notNull(),
    b: text('b').notNull(),
    requester: text('requester').notNull(),
    accepted: integer('accepted').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.a, t.b] }), index('social_friends_b').on(t.b)],
);
export const socialAccess = sqliteTable(
  'social_access',
  {
    owner: text('owner').notNull(),
    viewer: text('viewer').notNull(),
    blocked: integer('blocked').notNull().default(0),
    presence: integer('presence').notNull().default(0),
    stats: integer('stats').notNull().default(0),
    software: integer('software').notNull().default(0),
    live: integer('live').notNull().default(0),
    replay: integer('replay').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.owner, t.viewer] })],
);
