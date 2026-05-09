CREATE TABLE IF NOT EXISTS "AgentSettings" (
  "id" INTEGER NOT NULL,
  "agentName" TEXT NOT NULL DEFAULT 'AI Lead Responder',
  "agentEmail" TEXT NOT NULL DEFAULT '',
  "agentPhone" TEXT NOT NULL DEFAULT '',
  "businessName" TEXT NOT NULL DEFAULT 'Real Estate Team',
  "calendarLink" TEXT NOT NULL DEFAULT '',
  "preferredReplyTone" TEXT NOT NULL DEFAULT 'friendly and professional',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AgentSettings" (
  "id",
  "agentName",
  "agentEmail",
  "agentPhone",
  "businessName",
  "calendarLink",
  "preferredReplyTone"
)
VALUES (
  1,
  'AI Lead Responder',
  '',
  '',
  'Real Estate Team',
  '',
  'friendly and professional'
)
ON CONFLICT ("id") DO NOTHING;
