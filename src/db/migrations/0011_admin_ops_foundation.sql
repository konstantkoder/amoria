CREATE TABLE "admin_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "email" text,
  "display_name" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_users_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "admin_users_status_check" CHECK ("status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "admin_user_roles" (
  "admin_user_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_user_roles_admin_user_id_role_id_pk" PRIMARY KEY("admin_user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "reason" text,
  "metadata" jsonb,
  "request_id" text,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "admin_audit_log_admin_user_created_at_idx" ON "admin_audit_log" USING btree ("admin_user_id","created_at");
--> statement-breakpoint
INSERT INTO "admin_roles" ("key", "name", "description") VALUES
  ('owner', 'Owner', 'Full Admin/Ops access, role management, and sensitive audit review.'),
  ('support', 'Support', 'User lookup and non-destructive account support workflows.'),
  ('moderator', 'Moderator', 'Reports, complaints, moderation queue, and media review workflows.'),
  ('ops', 'Ops', 'Operational health, diagnostics, and rate-limit visibility.')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description";
