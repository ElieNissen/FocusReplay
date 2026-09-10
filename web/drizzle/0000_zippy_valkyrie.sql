CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
