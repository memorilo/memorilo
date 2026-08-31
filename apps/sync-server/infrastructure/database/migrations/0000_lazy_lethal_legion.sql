CREATE TABLE `sync_accounts` (
	`account_id` text PRIMARY KEY NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`membership_epoch` integer DEFAULT 0 NOT NULL,
	`policy_epoch` integer DEFAULT 0 NOT NULL,
	`enabled_modes` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_changes` (
	`id` text NOT NULL,
	`account_id` text NOT NULL,
	`namespace` text NOT NULL,
	`generation` integer NOT NULL,
	`device_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_changes_identity` ON `sync_changes` (`account_id`,`generation`,`namespace`,`device_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_changes_id` ON `sync_changes` (`account_id`,`generation`,`namespace`,`id`);--> statement-breakpoint
CREATE TABLE `sync_device_credentials` (
	`credential_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`device_id` text NOT NULL,
	`peer_id` text NOT NULL,
	`pairing_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_device_credentials_account_device` ON `sync_device_credentials` (`account_id`,`device_id`);--> statement-breakpoint
CREATE TABLE `sync_invites` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE TABLE `sync_pairing_sessions` (
	`pairing_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE TABLE `sync_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`csrf_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_users` (
	`account_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_users_username_unique` ON `sync_users` (`username`);