CREATE TABLE `sync_device_nonces` (
	`nonce_hash` text PRIMARY KEY NOT NULL,
	`credential_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_device_nonces_expiry` ON `sync_device_nonces` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sync_device_nonces_credential` ON `sync_device_nonces` (`credential_hash`);--> statement-breakpoint
ALTER TABLE `sync_device_credentials` ADD `signing_public_key` text NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_device_credentials` ADD `membership_epoch` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_device_credentials` ADD `scopes` text NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_device_credentials` ADD `expires_at` integer NOT NULL;