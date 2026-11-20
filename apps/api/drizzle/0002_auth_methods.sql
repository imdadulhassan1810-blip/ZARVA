ALTER TABLE "otp_challenges" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_sub" text;--> statement-breakpoint
-- Existing accounts all signed in by phone OTP, so their numbers are verified.
UPDATE "users" SET "phone_verified_at" = "created_at" WHERE "phone" IS NOT NULL;--> statement-breakpoint
-- Emails typed into the old profile form were never verified; "email" now means verified only.
UPDATE "users" SET "email" = NULL;--> statement-breakpoint
CREATE INDEX "otp_email_created_idx" ON "otp_challenges" USING btree ("email","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub");