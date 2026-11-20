CREATE TABLE "admin_unlocks" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"unlocked_until" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_step" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_unlocks" ADD CONSTRAINT "admin_unlocks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;