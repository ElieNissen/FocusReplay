ALTER TABLE `social_profiles` ADD `public_preview` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_profiles` ADD `previews` text DEFAULT '[]' NOT NULL;