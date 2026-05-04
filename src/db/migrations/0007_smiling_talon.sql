CREATE TABLE "together_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"client_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "together_events_session_from_client_unique" UNIQUE("session_id","from_user_id","client_event_id")
);
--> statement-breakpoint
CREATE TABLE "together_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity" text DEFAULT 'draw' NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"matched_session_id" uuid
);
--> statement-breakpoint
CREATE TABLE "together_reveals" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "together_reveals_session_user_unique" UNIQUE("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "together_session_members" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "together_session_members_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "together_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"prompt_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "together_events" ADD CONSTRAINT "together_events_session_id_together_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."together_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_events" ADD CONSTRAINT "together_events_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_matched_session_id_together_sessions_id_fk" FOREIGN KEY ("matched_session_id") REFERENCES "public"."together_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_reveals" ADD CONSTRAINT "together_reveals_session_id_together_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."together_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_reveals" ADD CONSTRAINT "together_reveals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_session_members" ADD CONSTRAINT "together_session_members_session_id_together_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."together_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_session_members" ADD CONSTRAINT "together_session_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "together_queue_user_waiting_unique" ON "together_queue" USING btree ("user_id") WHERE "together_queue"."status" = 'waiting';