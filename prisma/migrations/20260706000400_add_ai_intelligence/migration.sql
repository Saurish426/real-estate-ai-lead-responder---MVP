ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "aiIntelligence" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "leadScore" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "leadScoreLabel" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "sentiment" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "urgency" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT NOT NULL DEFAULT 'en';

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "longTermMemory" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "followUpRecommendation" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_leadScore_idx" ON "Lead"("leadScore");
CREATE INDEX IF NOT EXISTS "Lead_sentiment_idx" ON "Lead"("sentiment");
CREATE INDEX IF NOT EXISTS "Lead_urgency_idx" ON "Lead"("urgency");
