PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sync_changes` (
	`id` text NOT NULL,
	`account_id` text NOT NULL,
	`namespace` text NOT NULL,
	`generation` integer NOT NULL,
	`device_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT "sync_changes_namespace_kind" CHECK((
    ("__new_sync_changes"."namespace" = 'notes' AND "__new_sync_changes"."kind" = 'note-update') OR
    ("__new_sync_changes"."namespace" = 'learning' AND "__new_sync_changes"."kind" = 'learning-mutation')
  )),
	CONSTRAINT "sync_changes_positive_sequence" CHECK("__new_sync_changes"."sequence" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_sync_changes`("id", "account_id", "namespace", "generation", "device_id", "sequence", "kind", "payload", "received_at") SELECT "id", "account_id", "namespace", "generation", "device_id", "sequence", "kind", "payload", "received_at" FROM `sync_changes`;--> statement-breakpoint
DROP TABLE `sync_changes`;--> statement-breakpoint
ALTER TABLE `__new_sync_changes` RENAME TO `sync_changes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sync_changes_identity` ON `sync_changes` (`account_id`,`generation`,`namespace`,`device_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_changes_id` ON `sync_changes` (`account_id`,`generation`,`namespace`,`id`);