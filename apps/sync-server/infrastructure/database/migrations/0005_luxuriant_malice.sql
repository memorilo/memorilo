CREATE TABLE `sync_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`generation` integer NOT NULL,
	`namespace` text NOT NULL,
	`content_hash` text NOT NULL,
	`content_length` integer NOT NULL,
	`content_type` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "sync_objects_non_negative_length" CHECK("sync_objects"."content_length" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_objects_content_identity` ON `sync_objects` (`account_id`,`generation`,`content_hash`);--> statement-breakpoint
CREATE TABLE `sync_reset_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`generation` integer NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_reset_jobs_generation` ON `sync_reset_jobs` (`account_id`,`generation`);--> statement-breakpoint
ALTER TABLE `sync_accounts` ADD `next_receipt_sequence` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_changes` ADD `payload_hash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_changes` ADD `receipt_sequence` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `sync_changes_receipt_sequence` ON `sync_changes` (`account_id`,`generation`,`receipt_sequence`);