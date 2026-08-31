CREATE TABLE `sync_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`action` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`outcome` text NOT NULL,
	`request_id` text NOT NULL,
	`remote_address` text,
	`details` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_audit_events_account_created` ON `sync_audit_events` (`account_id`,`created_at`);