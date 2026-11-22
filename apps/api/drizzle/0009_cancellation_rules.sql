ALTER TYPE "public"."home_ledger_kind" ADD VALUE 'cancellation_penalty';--> statement-breakpoint
CREATE TABLE "home_pro_cancellations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"day" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_pro_penalties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_id" uuid NOT NULL,
	"day" text NOT NULL,
	"cancellations" integer NOT NULL,
	"penalty_bps" integer NOT NULL,
	"day_earnings_paise" integer NOT NULL,
	"penalty_paise" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "home_bookings" ADD COLUMN "cancellation" jsonb;--> statement-breakpoint
ALTER TABLE "home_bookings" ADD COLUMN "reschedule_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "home_pro_cancellations" ADD CONSTRAINT "home_pro_cancellations_pro_id_home_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."home_pros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_pro_cancellations" ADD CONSTRAINT "home_pro_cancellations_booking_id_home_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."home_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_pro_penalties" ADD CONSTRAINT "home_pro_penalties_pro_id_home_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."home_pros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_pro_cancellations_pro_day_idx" ON "home_pro_cancellations" USING btree ("pro_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "home_pro_penalties_pro_day_idx" ON "home_pro_penalties" USING btree ("pro_id","day");