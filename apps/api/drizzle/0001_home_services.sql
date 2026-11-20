CREATE TYPE "public"."home_booking_status" AS ENUM('pending_payment', 'confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."home_pay_mode" AS ENUM('online', 'after_service');--> statement-breakpoint
CREATE TYPE "public"."home_pro_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "home_booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" "home_booking_status" NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_booking_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"city_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"address_id" uuid NOT NULL,
	"address" jsonb NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"status" "home_booking_status" NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"fee_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"pay_mode" "home_pay_mode" NOT NULL,
	"payment_id" uuid,
	"paid" boolean DEFAULT false NOT NULL,
	"refunded_paise" integer DEFAULT 0 NOT NULL,
	"pro_id" uuid,
	"start_code" text NOT NULL,
	"customer_note" text,
	"cancel_reason" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"description" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "home_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "home_cities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"pincodes" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_pros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city_id" text NOT NULL,
	"category_ids" uuid[] NOT NULL,
	"locality" text,
	"status" "home_pro_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_pros_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "home_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price_paise" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"inclusions" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "home_services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "home_booking_events" ADD CONSTRAINT "home_booking_events_booking_id_home_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."home_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_booking_items" ADD CONSTRAINT "home_booking_items_booking_id_home_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."home_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_booking_items" ADD CONSTRAINT "home_booking_items_service_id_home_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."home_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_bookings" ADD CONSTRAINT "home_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_bookings" ADD CONSTRAINT "home_bookings_city_id_home_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."home_cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_bookings" ADD CONSTRAINT "home_bookings_category_id_home_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."home_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_bookings" ADD CONSTRAINT "home_bookings_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_bookings" ADD CONSTRAINT "home_bookings_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_bookings" ADD CONSTRAINT "home_bookings_pro_id_home_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."home_pros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_pros" ADD CONSTRAINT "home_pros_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_pros" ADD CONSTRAINT "home_pros_city_id_home_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."home_cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_services" ADD CONSTRAINT "home_services_category_id_home_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."home_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_booking_events_booking_idx" ON "home_booking_events" USING btree ("booking_id","seq");--> statement-breakpoint
CREATE INDEX "home_booking_items_booking_idx" ON "home_booking_items" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_bookings_idem_idx" ON "home_bookings" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "home_bookings_slot_idx" ON "home_bookings" USING btree ("city_id","category_id","slot_start");--> statement-breakpoint
CREATE INDEX "home_bookings_user_idx" ON "home_bookings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "home_bookings_pro_idx" ON "home_bookings" USING btree ("pro_id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_bookings_pro_slot_idx" ON "home_bookings" USING btree ("pro_id","slot_start") WHERE "home_bookings"."status" in ('assigned', 'on_the_way', 'in_progress');--> statement-breakpoint
CREATE INDEX "home_pros_city_idx" ON "home_pros" USING btree ("city_id","status");--> statement-breakpoint
CREATE INDEX "home_services_category_idx" ON "home_services" USING btree ("category_id");