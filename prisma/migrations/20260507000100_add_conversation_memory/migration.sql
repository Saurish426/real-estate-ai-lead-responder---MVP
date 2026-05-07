ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "messageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;

UPDATE "Conversation"
SET "messageCount" = 1
WHERE "messageCount" = 0;

CREATE INDEX IF NOT EXISTS "Conversation_leadId_idx" ON "Conversation"("leadId");
CREATE INDEX IF NOT EXISTS "Lead_email_idx" ON "Lead"("email");
