CREATE TABLE `shelf_assets` (
	`source_id` text NOT NULL,
	`url` text NOT NULL,
	`bytes` blob NOT NULL,
	`mime_type` text NOT NULL,
	`etag` text,
	`last_modified` text,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`source_id`, `url`)
);
--> statement-breakpoint
CREATE TABLE `shelf_image_cache_entries` (
	`source_id` text NOT NULL,
	`url` text NOT NULL,
	`byte_size` integer NOT NULL,
	`last_accessed_at` integer NOT NULL,
	PRIMARY KEY(`source_id`, `url`),
	FOREIGN KEY (`source_id`,`url`) REFERENCES `shelf_assets`(`source_id`,`url`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "shelf_image_cache_entries_byte_size_check" CHECK(byte_size > 0),
	CONSTRAINT "shelf_image_cache_entries_accessed_check" CHECK(last_accessed_at >= 0)
);
--> statement-breakpoint
CREATE INDEX `shelf_image_cache_lru_idx` ON `shelf_image_cache_entries` (`last_accessed_at`,`source_id`,`url`);--> statement-breakpoint
CREATE TABLE `shelf_pages` (
	`source_id` text NOT NULL,
	`url` text NOT NULL,
	`page_json` text NOT NULL,
	`etag` text,
	`last_modified` text,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`source_id`, `url`),
	FOREIGN KEY (`source_id`) REFERENCES `shelf_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shelf_source_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`source_id` text NOT NULL,
	`clock` text NOT NULL,
	`fields_json` text NOT NULL,
	`pending` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "shelf_source_operations_pending_check" CHECK(pending IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `shelf_source_operations_pending_idx` ON `shelf_source_operations` (`pending`,`clock`,`id`);--> statement-breakpoint
CREATE TABLE `shelf_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`username` text,
	`auth` text NOT NULL,
	`enabled` integer NOT NULL,
	`order_key` text NOT NULL,
	`encrypted_password` blob,
	`deleted` integer DEFAULT 0 NOT NULL,
	`field_clocks_json` text NOT NULL,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "shelf_sources_kind_check" CHECK(kind = 'opds'),
	CONSTRAINT "shelf_sources_auth_check" CHECK(auth IN ('none', 'basic')),
	CONSTRAINT "shelf_sources_enabled_check" CHECK(enabled IN (0, 1)),
	CONSTRAINT "shelf_sources_deleted_check" CHECK(deleted IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `shelf_sources_order_idx` ON `shelf_sources` (`deleted`,`enabled`,`order_key`,`id`);--> statement-breakpoint
CREATE TABLE `shelf_sync_state` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`last_physical` integer NOT NULL,
	`last_logical` integer NOT NULL,
	CONSTRAINT "shelf_sync_state_singleton_check" CHECK(singleton = 1),
	CONSTRAINT "shelf_sync_state_physical_check" CHECK(last_physical >= 0),
	CONSTRAINT "shelf_sync_state_logical_check" CHECK(last_logical >= 0)
);
