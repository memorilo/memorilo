CREATE TABLE "sync_accounts" (
	"account_id" text PRIMARY KEY NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"membership_epoch" integer DEFAULT 1 NOT NULL,
	"next_receipt_sequence" integer DEFAULT 1 NOT NULL,
	"policy_epoch" integer DEFAULT 0 NOT NULL,
	"enabled_modes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"namespace" text NOT NULL,
	"generation" integer NOT NULL,
	"device_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" text NOT NULL,
	"payload_hash" text NOT NULL,
	"receipt_sequence" integer NOT NULL,
	"received_at" integer NOT NULL,
	CONSTRAINT "sync_changes_namespace_kind" CHECK ((
    ("sync_changes"."namespace" = 'notes' AND "sync_changes"."kind" = 'note-update') OR
    ("sync_changes"."namespace" = 'learning' AND "sync_changes"."kind" = 'learning-mutation')
  )),
	CONSTRAINT "sync_changes_positive_sequence" CHECK ("sync_changes"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "sync_device_credentials" (
	"credential_hash" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text NOT NULL,
	"peer_id" text NOT NULL,
	"pairing_id" text NOT NULL,
	"created_at" integer NOT NULL,
	"revoked_at" integer
);
--> statement-breakpoint
CREATE TABLE "sync_invites" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"created_at" integer NOT NULL,
	"expires_at" integer NOT NULL,
	"revoked_at" integer,
	"consumed_at" integer
);
--> statement-breakpoint
CREATE TABLE "sync_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"generation" integer NOT NULL,
	"namespace" text NOT NULL,
	"content_hash" text NOT NULL,
	"content_length" integer NOT NULL,
	"content_type" text,
	"created_at" integer NOT NULL,
	CONSTRAINT "sync_objects_non_negative_length" CHECK ("sync_objects"."content_length" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sync_pairing_sessions" (
	"pairing_id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"created_at" integer NOT NULL,
	"expires_at" integer NOT NULL,
	"consumed_at" integer
);
--> statement-breakpoint
CREATE TABLE "sync_reset_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"generation" integer NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" integer,
	"last_error" text,
	"created_at" integer NOT NULL,
	"completed_at" integer
);
--> statement-breakpoint
CREATE TABLE "sync_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"csrf_token" text NOT NULL,
	"expires_at" integer NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_users" (
	"account_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" integer NOT NULL,
	CONSTRAINT "sync_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sync_changes_identity" ON "sync_changes" USING btree ("account_id","generation","namespace","device_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_changes_id" ON "sync_changes" USING btree ("account_id","generation","namespace","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_changes_receipt_sequence" ON "sync_changes" USING btree ("account_id","generation","receipt_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_device_credentials_account_device" ON "sync_device_credentials" USING btree ("account_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_objects_content_identity" ON "sync_objects" USING btree ("account_id","generation","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_reset_jobs_generation" ON "sync_reset_jobs" USING btree ("account_id","generation");