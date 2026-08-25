ALTER TABLE "users" ADD COLUMN "preferred_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_preferred_locale_check" CHECK ("preferred_locale" IN ('en','ru','hr','uk','pl','de','fr','es','it','pt','nl','sv','no','da','fi','cs','sk','sl','sr','bs','ro','hu','el','tr'));--> statement-breakpoint
ALTER TABLE "push_tokens" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_locale_check" CHECK ("locale" IS NULL OR "locale" IN ('en','ru','hr','uk','pl','de','fr','es','it','pt','nl','sv','no','da','fi','cs','sk','sl','sr','bs','ro','hu','el','tr'));

