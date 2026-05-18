CREATE TABLE IF NOT EXISTS "EventLog" (
  "id" SERIAL NOT NULL,
  "eventType" TEXT NOT NULL,
  "leadId" INTEGER,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventLog_eventType_idx" ON "EventLog"("eventType");
CREATE INDEX IF NOT EXISTS "EventLog_leadId_idx" ON "EventLog"("leadId");
CREATE INDEX IF NOT EXISTS "EventLog_createdAt_idx" ON "EventLog"("createdAt");
