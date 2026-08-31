CREATE TABLE `asset_sync_manifests` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`file_name` text NOT NULL,
	`operation` text NOT NULL,
	`content_hash` text,
	`content_length` integer,
	`content_type` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "asset_sync_manifests_sequence_check" CHECK("asset_sync_manifests"."sequence" > 0),
	CONSTRAINT "asset_sync_manifests_shape_check" CHECK((
    ("asset_sync_manifests"."operation" = 'put' AND "asset_sync_manifests"."content_hash" IS NOT NULL AND "asset_sync_manifests"."content_length" IS NOT NULL AND "asset_sync_manifests"."content_type" IS NOT NULL) OR
    ("asset_sync_manifests"."operation" = 'delete' AND "asset_sync_manifests"."content_hash" IS NULL AND "asset_sync_manifests"."content_length" IS NULL AND "asset_sync_manifests"."content_type" IS NULL)
  ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_sync_manifests_device_sequence_unique` ON `asset_sync_manifests` (`device_id`,`sequence`);