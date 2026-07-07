CREATE TABLE IF NOT EXISTS "Organization" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

INSERT INTO "Organization" ("id", "name", "slug")
VALUES (1, 'Demo Organization', 'demo-organization')
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "Office" (
  "id" SERIAL NOT NULL,
  "organizationId" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL DEFAULT 'Demo Office',
  "officeEmail" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "brandName" TEXT NOT NULL DEFAULT 'Real Estate Team',
  "logoUrl" TEXT NOT NULL DEFAULT '',
  "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
  "secondaryColor" TEXT NOT NULL DEFAULT '#0f172a',
  "websiteUrl" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Office_organizationId_idx" ON "Office"("organizationId");

INSERT INTO "Office" (
  "id",
  "organizationId",
  "name",
  "officeEmail",
  "brandName",
  "primaryColor",
  "secondaryColor"
)
VALUES (
  1,
  1,
  'Demo Office',
  '',
  'Real Estate Team',
  '#2563eb',
  '#0f172a'
)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "officeId" INTEGER;

ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "officeId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "teamRole" TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "officeId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "assignedAgentId" INTEGER;

ALTER TABLE "LeadNote" ADD COLUMN IF NOT EXISTS "officeId" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "officeId" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FollowUpReminder" ADD COLUMN IF NOT EXISTS "officeId" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "officeId" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "EventLog" ADD COLUMN IF NOT EXISTS "officeId" INTEGER;

UPDATE "User"
SET "officeId" = 1
WHERE "officeId" IS NULL;

CREATE INDEX IF NOT EXISTS "User_officeId_idx" ON "User"("officeId");
CREATE INDEX IF NOT EXISTS "Agent_officeId_idx" ON "Agent"("officeId");
CREATE INDEX IF NOT EXISTS "Agent_isActive_idx" ON "Agent"("isActive");
CREATE INDEX IF NOT EXISTS "Lead_officeId_idx" ON "Lead"("officeId");
CREATE INDEX IF NOT EXISTS "Lead_assignedAgentId_idx" ON "Lead"("assignedAgentId");
CREATE INDEX IF NOT EXISTS "LeadNote_officeId_idx" ON "LeadNote"("officeId");
CREATE INDEX IF NOT EXISTS "Conversation_officeId_idx" ON "Conversation"("officeId");
CREATE INDEX IF NOT EXISTS "FollowUpReminder_officeId_idx" ON "FollowUpReminder"("officeId");
CREATE INDEX IF NOT EXISTS "AgentSettings_officeId_idx" ON "AgentSettings"("officeId");
CREATE INDEX IF NOT EXISTS "EventLog_officeId_idx" ON "EventLog"("officeId");

DO $$
BEGIN
  ALTER TABLE "Office" ADD CONSTRAINT "Office_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Agent" ADD CONSTRAINT "Agent_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
