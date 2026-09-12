ALTER TABLE `social_profiles` ADD `public_activity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_profiles` ADD `last_session` text DEFAULT 'null' NOT NULL;