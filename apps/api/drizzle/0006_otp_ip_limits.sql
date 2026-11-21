CREATE INDEX "otp_ip_created_idx" ON "otp_challenges" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "otp_created_idx" ON "otp_challenges" USING btree ("created_at");