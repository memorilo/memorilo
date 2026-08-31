PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_learning_cards` (
	`card_id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`topic_order` integer NOT NULL,
	`source_block_id` text NOT NULL,
	`source_order` integer NOT NULL,
	`kind` text NOT NULL,
	`direction` text NOT NULL,
	`active` integer NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`inactive_at` integer,
	`sync_sequence` integer DEFAULT -1 NOT NULL,
	CONSTRAINT "learning_cards_topic_order_check" CHECK(topic_order >= 0),
	CONSTRAINT "learning_cards_source_order_check" CHECK(source_order >= 0),
	CONSTRAINT "learning_cards_kind_check" CHECK(kind IN ('basic', 'cloze', 'list', 'set')),
	CONSTRAINT "learning_cards_direction_check" CHECK(direction IN ('backward', 'forward')),
	CONSTRAINT "learning_cards_active_check" CHECK(active IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_learning_cards`("card_id", "note_id", "topic_id", "topic_order", "source_block_id", "source_order", "kind", "direction", "active", "first_seen_at", "last_seen_at", "inactive_at", "sync_sequence") SELECT "card_id", "note_id", "topic_id", "topic_order", "source_block_id", "source_order", "kind", "direction", "active", "first_seen_at", "last_seen_at", "inactive_at", "sync_sequence" FROM `learning_cards`;--> statement-breakpoint
DROP TABLE `learning_cards`;--> statement-breakpoint
ALTER TABLE `__new_learning_cards` RENAME TO `learning_cards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `learning_cards_sibling_idx` ON `learning_cards` (`source_block_id`,`active`);--> statement-breakpoint
CREATE INDEX `learning_cards_topic_idx` ON `learning_cards` (`note_id`,`topic_id`,`active`);--> statement-breakpoint
CREATE TABLE `__new_learning_maintenance_state` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`phase` text NOT NULL,
	`archived_optimizers` integer NOT NULL,
	`inactive_cards` integer NOT NULL,
	`review_events` integer NOT NULL,
	`targets` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "learning_maintenance_state_singleton_check" CHECK(singleton = 1),
	CONSTRAINT "learning_maintenance_state_phase_check" CHECK(phase = 'vacuum-pending'),
	CONSTRAINT "learning_maintenance_state_archived_check" CHECK(archived_optimizers >= 0),
	CONSTRAINT "learning_maintenance_state_inactive_check" CHECK(inactive_cards >= 0),
	CONSTRAINT "learning_maintenance_state_events_check" CHECK(review_events >= 0),
	CONSTRAINT "learning_maintenance_state_targets_check" CHECK(targets >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_learning_maintenance_state`("singleton", "phase", "archived_optimizers", "inactive_cards", "review_events", "targets", "created_at") SELECT "singleton", "phase", "archived_optimizers", "inactive_cards", "review_events", "targets", "created_at" FROM `learning_maintenance_state`;--> statement-breakpoint
DROP TABLE `learning_maintenance_state`;--> statement-breakpoint
ALTER TABLE `__new_learning_maintenance_state` RENAME TO `learning_maintenance_state`;--> statement-breakpoint
CREATE TABLE `__new_learning_purge_tombstones` (
	`tombstone_id` text PRIMARY KEY NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_id` text NOT NULL,
	`generation` integer NOT NULL,
	`created_at` integer NOT NULL,
	`server_sequence` integer DEFAULT -1 NOT NULL,
	CONSTRAINT "learning_purge_tombstones_scope_check" CHECK(scope_kind IN ('card', 'optimizer', 'target')),
	CONSTRAINT "learning_purge_tombstones_generation_check" CHECK(generation > 0)
);
--> statement-breakpoint
INSERT INTO `__new_learning_purge_tombstones`("tombstone_id", "scope_kind", "scope_id", "generation", "created_at", "server_sequence") SELECT "tombstone_id", "scope_kind", "scope_id", "generation", "created_at", "server_sequence" FROM `learning_purge_tombstones`;--> statement-breakpoint
DROP TABLE `learning_purge_tombstones`;--> statement-breakpoint
ALTER TABLE `__new_learning_purge_tombstones` RENAME TO `learning_purge_tombstones`;--> statement-breakpoint
CREATE TABLE `__new_learning_review_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`card_id` text NOT NULL,
	`note_id` text NOT NULL,
	`event_kind` text NOT NULL,
	`rating` text,
	`occurred_at` integer NOT NULL,
	`response_milliseconds` integer,
	`scheduled_days` integer,
	`elapsed_days` integer,
	`base_event_id` text,
	`undoes_event_id` text,
	`reset_epoch` text,
	`result_state_json` text,
	`device_id` text NOT NULL,
	`device_sequence` integer NOT NULL,
	`server_sequence` integer DEFAULT -1 NOT NULL,
	`fsrs_version` text NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `learning_targets`(`target_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "learning_review_events_device_sequence_check" CHECK(device_sequence > 0),
	CONSTRAINT "learning_review_events_kind_check" CHECK(event_kind IN ('rating', 'reset', 'undo')),
	CONSTRAINT "learning_review_events_rating_check" CHECK(rating IS NULL OR rating IN ('again', 'hard', 'good', 'easy')),
	CONSTRAINT "learning_review_events_response_check" CHECK(response_milliseconds IS NULL OR response_milliseconds >= 0),
	CONSTRAINT "learning_review_events_scheduled_days_check" CHECK(scheduled_days IS NULL OR scheduled_days >= 0),
	CONSTRAINT "learning_review_events_elapsed_days_check" CHECK(elapsed_days IS NULL OR elapsed_days >= 0),
	CONSTRAINT "learning_review_events_consistency_check" CHECK((event_kind = 'rating' AND rating IS NOT NULL AND undoes_event_id IS NULL) OR (event_kind = 'undo' AND rating IS NULL AND undoes_event_id IS NOT NULL) OR (event_kind = 'reset' AND rating IS NULL AND reset_epoch IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_learning_review_events`("event_id", "target_id", "card_id", "note_id", "event_kind", "rating", "occurred_at", "response_milliseconds", "scheduled_days", "elapsed_days", "base_event_id", "undoes_event_id", "reset_epoch", "result_state_json", "device_id", "device_sequence", "server_sequence", "fsrs_version") SELECT "event_id", "target_id", "card_id", "note_id", "event_kind", "rating", "occurred_at", "response_milliseconds", "scheduled_days", "elapsed_days", "base_event_id", "undoes_event_id", "reset_epoch", "result_state_json", "device_id", "device_sequence", "server_sequence", "fsrs_version" FROM `learning_review_events`;--> statement-breakpoint
DROP TABLE `learning_review_events`;--> statement-breakpoint
ALTER TABLE `__new_learning_review_events` RENAME TO `learning_review_events`;--> statement-breakpoint
CREATE INDEX `learning_review_event_undoes_idx` ON `learning_review_events` (`undoes_event_id`);--> statement-breakpoint
CREATE INDEX `learning_review_event_card_time_idx` ON `learning_review_events` (`card_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `learning_review_event_kind_time_idx` ON `learning_review_events` (`event_kind`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `learning_review_event_target_time_idx` ON `learning_review_events` (`target_id`,`occurred_at`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_review_event_device_sequence_idx` ON `learning_review_events` (`device_id`,`device_sequence`);--> statement-breakpoint
CREATE TABLE `__new_learning_sibling_bury_events` (
	`source_event_id` text PRIMARY KEY NOT NULL,
	`source_card_id` text NOT NULL,
	`note_id` text NOT NULL,
	`source_block_id` text NOT NULL,
	`source_queue` text NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`source_event_id`) REFERENCES `learning_review_events`(`event_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "learning_sibling_bury_events_queue_check" CHECK(source_queue IN ('intraday-learning', 'interday-learning', 'review', 'new'))
);
--> statement-breakpoint
INSERT INTO `__new_learning_sibling_bury_events`("source_event_id", "source_card_id", "note_id", "source_block_id", "source_queue", "occurred_at") SELECT "source_event_id", "source_card_id", "note_id", "source_block_id", "source_queue", "occurred_at" FROM `learning_sibling_bury_events`;--> statement-breakpoint
DROP TABLE `learning_sibling_bury_events`;--> statement-breakpoint
ALTER TABLE `__new_learning_sibling_bury_events` RENAME TO `learning_sibling_bury_events`;--> statement-breakpoint
CREATE INDEX `learning_sibling_bury_event_time_idx` ON `learning_sibling_bury_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `learning_sibling_bury_event_group_idx` ON `learning_sibling_bury_events` (`note_id`,`source_block_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `__new_learning_sync_outbox` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "learning_sync_outbox_entity_kind_check" CHECK(entity_kind IN ('assignment', 'card', 'optimizer', 'review-event', 'tombstone')),
	CONSTRAINT "learning_sync_outbox_operation_check" CHECK(operation IN ('upsert', 'delete'))
);
--> statement-breakpoint
INSERT INTO `__new_learning_sync_outbox`("mutation_id", "entity_kind", "entity_id", "operation", "payload_json", "created_at") SELECT "mutation_id", "entity_kind", "entity_id", "operation", "payload_json", "created_at" FROM `learning_sync_outbox`;--> statement-breakpoint
DROP TABLE `learning_sync_outbox`;--> statement-breakpoint
ALTER TABLE `__new_learning_sync_outbox` RENAME TO `learning_sync_outbox`;--> statement-breakpoint
CREATE INDEX `learning_sync_outbox_order_idx` ON `learning_sync_outbox` (`created_at`,`mutation_id`);--> statement-breakpoint
CREATE TABLE `__new_learning_sync_received_mutations` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`source_device_id` text NOT NULL,
	`source_sequence` integer NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT "learning_sync_received_mutations_source_sequence_check" CHECK(source_sequence > 0)
);
--> statement-breakpoint
INSERT INTO `__new_learning_sync_received_mutations`("mutation_id", "source_device_id", "source_sequence", "received_at") SELECT "mutation_id", "source_device_id", "source_sequence", "received_at" FROM `learning_sync_received_mutations`;--> statement-breakpoint
DROP TABLE `learning_sync_received_mutations`;--> statement-breakpoint
ALTER TABLE `__new_learning_sync_received_mutations` RENAME TO `learning_sync_received_mutations`;