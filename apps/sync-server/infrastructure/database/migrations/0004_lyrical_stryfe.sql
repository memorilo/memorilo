PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sync_accounts` (
	`account_id` text PRIMARY KEY NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`membership_epoch` integer DEFAULT 1 NOT NULL,
	`policy_epoch` integer DEFAULT 0 NOT NULL,
	`enabled_modes` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sync_accounts`("account_id", "generation", "membership_epoch", "policy_epoch", "enabled_modes") SELECT "account_id", "generation", "membership_epoch", "policy_epoch", "enabled_modes" FROM `sync_accounts`;--> statement-breakpoint
DROP TABLE `sync_accounts`;--> statement-breakpoint
ALTER TABLE `__new_sync_accounts` RENAME TO `sync_accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;