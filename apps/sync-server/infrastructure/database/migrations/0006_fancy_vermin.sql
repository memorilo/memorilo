CREATE TABLE `sync_asset_manifests` (
	`id` text NOT NULL,
	`account_id` text NOT NULL,
	`generation` integer NOT NULL,
	`device_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`file_name` text NOT NULL,
	`operation` text NOT NULL,
	`content_hash` text,
	`content_length` integer,
	`content_type` text,
	`created_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT "sync_asset_manifests_shape" CHECK((
    ("sync_asset_manifests"."operation" = 'delete' AND "sync_asset_manifests"."content_hash" IS NULL AND "sync_asset_manifests"."content_length" IS NULL AND "sync_asset_manifests"."content_type" IS NULL) OR
    ("sync_asset_manifests"."operation" = 'put' AND "sync_asset_manifests"."content_hash" IS NOT NULL AND "sync_asset_manifests"."content_length" IS NOT NULL AND "sync_asset_manifests"."content_length" >= 0)
  )),
	CONSTRAINT "sync_asset_manifests_positive_sequence" CHECK("sync_asset_manifests"."sequence" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_asset_manifests_identity` ON `sync_asset_manifests` (`account_id`,`generation`,`device_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_asset_manifests_id` ON `sync_asset_manifests` (`account_id`,`generation`,`id`);