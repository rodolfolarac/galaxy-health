CREATE TABLE "muscle_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "muscle_group_id" integer;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "rest_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "rest_per_set" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "muscle_groups" ADD CONSTRAINT "muscle_groups_parent_id_muscle_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."muscle_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "muscle_groups_parent_idx" ON "muscle_groups" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_muscle_group_id_muscle_groups_id_fk" FOREIGN KEY ("muscle_group_id") REFERENCES "public"."muscle_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Dados: cada texto distinto de muscle_group vira um grupo (na ordem em que apareceu) e o exercício passa a apontar para ele.
INSERT INTO "muscle_groups" ("name", "sort_order")
SELECT g.name, (row_number() OVER (ORDER BY g.first_id))::int - 1
FROM (SELECT trim("muscle_group") AS name, min("id") AS first_id FROM "exercises"
      WHERE "muscle_group" IS NOT NULL AND trim("muscle_group") <> '' GROUP BY trim("muscle_group")) g;
--> statement-breakpoint
UPDATE "exercises" e SET "muscle_group_id" = g."id"
FROM "muscle_groups" g
WHERE g."parent_id" IS NULL AND g."name" = trim(e."muscle_group");
