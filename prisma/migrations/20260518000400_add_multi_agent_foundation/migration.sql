CREATE TABLE IF NOT EXISTS "Agent" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "businessName" TEXT NOT NULL DEFAULT 'Real Estate Team',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Agent" ("id", "name", "email", "phone", "businessName")
VALUES (1, 'Demo Agent', '', '', 'Real Estate Team')
ON CONFLICT ("id") DO NOTHING;

SELECT setval(pg_get_serial_sequence('"Agent"', 'id'), GREATEST((SELECT MAX("id") FROM "Agent"), 1), true);

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "agentId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "agentId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "agentId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "EventLog" ADD COLUMN IF NOT EXISTS "agentId" INTEGER;

UPDATE "Lead" SET "agentId" = 1 WHERE "agentId" IS NULL;
UPDATE "Conversation" SET "agentId" = 1 WHERE "agentId" IS NULL;
UPDATE "AgentSettings" SET "agentId" = 1 WHERE "agentId" IS NULL;
UPDATE "EventLog" AS e
SET "agentId" = l."agentId"
FROM "Lead" AS l
WHERE e."leadId" = l."id" AND e."agentId" IS NULL;
UPDATE "EventLog" SET "agentId" = 1 WHERE "agentId" IS NULL;

CREATE INDEX IF NOT EXISTS "Lead_agentId_idx" ON "Lead"("agentId");
CREATE INDEX IF NOT EXISTS "Conversation_agentId_idx" ON "Conversation"("agentId");
CREATE INDEX IF NOT EXISTS "EventLog_agentId_idx" ON "EventLog"("agentId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentSettings_agentId_key" ON "AgentSettings"("agentId");

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AgentSettings" ADD CONSTRAINT "AgentSettings_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
