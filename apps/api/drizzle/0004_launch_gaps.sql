CREATE TYPE "public"."notify_channel" AS ENUM('sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notify_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."home_ledger_kind" AS ENUM('job_earning', 'cash_collected', 'payout', 'payout_reversal', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."home_payout_status" AS ENUM('processing', 'manual', 'paid', 'failed');--> statement-breakpoint
ALTER TYPE "public"."home_pro_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "public"."home_pro_status" ADD VALUE 'rejected';--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "notify_channel" NOT NULL,
	"user_id" uuid,
	"to_phone" text NOT NULL,
	"event" text NOT NULL,
	"vars" jsonb NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "notify_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "home_payout_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" "home_payout_status" NOT NULL,
	"provider" text NOT NULL,
	"provider_payout_id" text,
	"destination" text NOT NULL,
	"utr" text,
	"failure_reason" text,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "home_payouts_provider_payout_id_unique" UNIQUE("provider_payout_id")
);
--> statement-breakpoint
CREATE TABLE "home_pro_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_pro_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"pro_id" uuid NOT NULL,
	"kind" "home_ledger_kind" NOT NULL,
	"amount_paise" integer NOT NULL,
	"booking_id" uuid,
	"payout_id" uuid,
	"gross_paise" integer,
	"commission_paise" integer,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "home_categories" ADD COLUMN "commission_bps" integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "experience_years" integer;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "id_type" text;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "payout_account_name" text;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "payout_upi" text;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "payout_bank_account" text;--> statement-breakpoint
ALTER TABLE "home_pros" ADD COLUMN "payout_ifsc" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_payouts" ADD CONSTRAINT "home_payouts_pro_id_home_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."home_pros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_payouts" ADD CONSTRAINT "home_payouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_pro_documents" ADD CONSTRAINT "home_pro_documents_pro_id_home_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."home_pros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_pro_ledger" ADD CONSTRAINT "home_pro_ledger_pro_id_home_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."home_pros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_pro_ledger" ADD CONSTRAINT "home_pro_ledger_booking_id_home_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."home_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_pro_ledger" ADD CONSTRAINT "home_pro_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key","channel");--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "home_payout_events_dedupe_idx" ON "home_payout_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "home_payouts_pro_idx" ON "home_payouts" USING btree ("pro_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "home_pro_documents_kind_idx" ON "home_pro_documents" USING btree ("pro_id","kind");--> statement-breakpoint
CREATE INDEX "home_pro_ledger_pro_idx" ON "home_pro_ledger" USING btree ("pro_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "home_pro_ledger_booking_kind_idx" ON "home_pro_ledger" USING btree ("booking_id","kind") WHERE "home_pro_ledger"."booking_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "home_pro_ledger_payout_kind_idx" ON "home_pro_ledger" USING btree ("payout_id","kind") WHERE "home_pro_ledger"."payout_id" is not null;--> statement-breakpoint
ALTER TABLE "home_pros" ADD CONSTRAINT "home_pros_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;