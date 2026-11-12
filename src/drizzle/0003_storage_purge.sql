CREATE TABLE "storage_purge" (
	"bucket" text NOT NULL,
	"path" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_purge_bucket_path_pk" PRIMARY KEY("bucket","path")
);
--> statement-breakpoint
ALTER TABLE "storage_purge" ENABLE ROW LEVEL SECURITY;