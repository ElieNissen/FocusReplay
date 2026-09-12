CREATE TABLE `social_access` (
	`owner` text NOT NULL,
	`viewer` text NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`presence` integer DEFAULT 0 NOT NULL,
	`stats` integer DEFAULT 0 NOT NULL,
	`software` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `viewer`)
);
--> statement-breakpoint
CREATE TABLE `social_friends` (
	`a` text NOT NULL,
	`b` text NOT NULL,
	`requester` text NOT NULL,
	`accepted` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`a`, `b`)
);
--> statement-breakpoint
CREATE INDEX `social_friends_b` ON `social_friends` (`b`);--> statement-breakpoint
CREATE TABLE `social_profiles` (
	`profile` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`discoverable` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`days` text DEFAULT '[]' NOT NULL,
	`software` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `social_directory` ON `social_profiles` (`discoverable`,`profile`);