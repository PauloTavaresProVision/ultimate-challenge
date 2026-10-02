CREATE TABLE "GroupInbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" BIGSERIAL NOT NULL UNIQUE,
  "group" TEXT NOT NULL,
  "messageAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "encryptedPayload" TEXT NOT NULL,
  "encryptedContext" TEXT,
  "encryptedDecision" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT
);
CREATE INDEX "GroupInbox_group_status_messageAt_sequence_idx" ON "GroupInbox"("group", "status", "messageAt", "sequence");
