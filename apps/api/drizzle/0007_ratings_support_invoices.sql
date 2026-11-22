CREATE TYPE "public"."support_status" AS ENUM('open', 'waiting_customer', 'resolved');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"rating" integer,
	"message" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"ticket_id" uuid NOT NULL,
	"user_id" uuid,
	"admin_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"subject" text NOT NULL,
	"status" "support_status" DEFAULT 'open' NOT NULL,
	"module" text,
	"reference_id" text,
	"reference_label" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
CREATE TABLE "home_invoice_counters" (
	"fy" text PRIMARY KEY NOT NULL,
	"last" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "home_invoices_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "home_invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "home_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pro_id" uuid,
	"category_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"customer_name" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"hidden_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_reviews_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "home_reviews_rating_check" CHECK ("home_reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_invoices" ADD CONSTRAINT "home_invoices_booking_id_home_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."home_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_reviews" ADD CONSTRAINT "home_reviews_booking_id_home_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."home_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_reviews" ADD CONSTRAINT "home_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_reviews" ADD CONSTRAINT "home_reviews_pro_id_home_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."home_pros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_reviews" ADD CONSTRAINT "home_reviews_category_id_home_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."home_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_idx" ON "support_messages" USING btree ("ticket_id","seq");--> statement-breakpoint
CREATE INDEX "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "support_tickets_ref_idx" ON "support_tickets" USING btree ("module","reference_id");--> statement-breakpoint
CREATE INDEX "home_reviews_pro_idx" ON "home_reviews" USING btree ("pro_id","created_at");--> statement-breakpoint
CREATE INDEX "home_reviews_category_idx" ON "home_reviews" USING btree ("category_id","created_at");--> statement-breakpoint
CREATE INDEX "home_reviews_created_idx" ON "home_reviews" USING btree ("created_at");