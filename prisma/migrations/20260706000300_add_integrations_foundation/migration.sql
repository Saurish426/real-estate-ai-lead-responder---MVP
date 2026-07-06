ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "calendarEventId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "calendarEventLink" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "followUpReminderAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "followUpReminderStatus" TEXT;

CREATE TABLE IF NOT EXISTS "FollowUpReminder" (
  "id" SERIAL NOT NULL,
  "agentId" INTEGER NOT NULL DEFAULT 1,
  "leadId" INTEGER NOT NULL,
  "conversationId" INTEGER,
  "reminderType" TEXT NOT NULL DEFAULT 'lead_follow_up',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "message" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FollowUpReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FollowUpReminder_agentId_idx" ON "FollowUpReminder"("agentId");
CREATE INDEX IF NOT EXISTS "FollowUpReminder_leadId_idx" ON "FollowUpReminder"("leadId");
CREATE INDEX IF NOT EXISTS "FollowUpReminder_scheduledFor_idx" ON "FollowUpReminder"("scheduledFor");
CREATE INDEX IF NOT EXISTS "FollowUpReminder_status_idx" ON "FollowUpReminder"("status");

DO $$
BEGIN
  ALTER TABLE "FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
