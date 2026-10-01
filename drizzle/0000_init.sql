CREATE TABLE "bands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"brand" text,
	"min_kg" real,
	"max_kg" real,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "body_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"weight_kg" real,
	"waist_cm" real,
	"chest_cm" real,
	"arm_cm" real,
	"thigh_cm" real,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercise_id" integer,
	"name" text NOT NULL,
	"day" text NOT NULL,
	"seconds" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'strength' NOT NULL,
	"muscle_group" text,
	"equipment" text DEFAULT 'band' NOT NULL,
	"measure" text DEFAULT 'reps' NOT NULL,
	"per_side" boolean DEFAULT false NOT NULL,
	"default_sets" integer DEFAULT 3 NOT NULL,
	"default_reps" integer,
	"default_seconds" integer,
	"rest_seconds" integer DEFAULT 60 NOT NULL,
	"default_band_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_setup" text,
	"instructions" text,
	"notes" text,
	"videos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"ip" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program" (
	"id" integer PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'weekly' NOT NULL,
	"weekly" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rotation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rotation_index" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"target_sets" integer,
	"target_reps" integer,
	"target_reps_max" integer,
	"target_seconds" integer,
	"rest_seconds" integer,
	"superset_group" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workout_id" integer,
	"name" text NOT NULL,
	"color" text DEFAULT '#7c3aed' NOT NULL,
	"day" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"rpe" integer,
	"energy" integer,
	"pain" text,
	"rotation_slot" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_exercise_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"reps" integer,
	"seconds" integer,
	"weight_kg" real,
	"band_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"setup" text,
	"adjust_pct" real,
	"load_kg" real,
	"rpe" integer,
	"notes" text,
	"done" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workout_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"workout_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"target_sets" integer DEFAULT 3 NOT NULL,
	"target_reps" integer,
	"target_reps_max" integer,
	"target_seconds" integer,
	"rest_seconds" integer,
	"superset_group" text,
	"band_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"setup" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"color" text DEFAULT '#7c3aed' NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_items" ADD CONSTRAINT "workout_items_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_items" ADD CONSTRAINT "workout_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "body_day_idx" ON "body_metrics" USING btree ("day");--> statement-breakpoint
CREATE INDEX "checkins_day_idx" ON "checkins" USING btree ("day");--> statement-breakpoint
CREATE INDEX "exercises_kind_idx" ON "exercises" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "session_ex_session_idx" ON "session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_ex_exercise_idx" ON "session_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "sessions_day_idx" ON "sessions" USING btree ("day");--> statement-breakpoint
CREATE INDEX "sessions_workout_idx" ON "sessions" USING btree ("workout_id");--> statement-breakpoint
CREATE INDEX "sets_session_ex_idx" ON "sets" USING btree ("session_exercise_id");--> statement-breakpoint
CREATE INDEX "sets_exercise_idx" ON "sets" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_items_workout_idx" ON "workout_items" USING btree ("workout_id");