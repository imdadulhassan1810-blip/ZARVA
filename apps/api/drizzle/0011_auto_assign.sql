ALTER TABLE "home_bookings" ADD COLUMN "alert_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "home_bookings" ADD COLUMN "alert_reason" text;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "accepting_jobs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "work_days" integer[] DEFAULT '{0,1,2,3,4,5,6}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "work_start_hour" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "work_end_hour" integer DEFAULT 20 NOT NULL;