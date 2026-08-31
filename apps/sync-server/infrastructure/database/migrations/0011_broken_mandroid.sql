CREATE TABLE `sync_learning_entities` (
	`account_id` text NOT NULL,
	`generation` integer NOT NULL,
	`entity_id` text NOT NULL,
	`entity_kind` text NOT NULL,
	`operation` text NOT NULL,
	`mutation_id` text NOT NULL,
	`source_device_id` text NOT NULL,
	`source_sequence` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "sync_learning_entities_positive_sequence" CHECK("sync_learning_entities"."source_sequence" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_learning_entities_identity` ON `sync_learning_entities` (`account_id`,`generation`,`entity_id`);--> statement-breakpoint
CREATE TABLE `sync_learning_tombstones` (
	`account_id` text NOT NULL,
	`generation` integer NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_id` text NOT NULL,
	`tombstone_id` text NOT NULL,
	`tombstone_generation` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_learning_tombstones_identity` ON `sync_learning_tombstones` (`account_id`,`generation`,`scope_kind`,`scope_id`);--> statement-breakpoint
CREATE TABLE `sync_note_snapshots` (
	`account_id` text NOT NULL,
	`generation` integer NOT NULL,
	`note_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`frontier` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_note_snapshots_identity` ON `sync_note_snapshots` (`account_id`,`generation`,`note_id`);