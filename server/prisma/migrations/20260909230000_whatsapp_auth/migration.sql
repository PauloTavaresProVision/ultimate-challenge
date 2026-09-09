CREATE TABLE "WhatsAppAuthSession" (
  "id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL
);
CREATE TABLE "WhatsAppAuthKey" (
  "sessionId" TEXT NOT NULL REFERENCES "WhatsAppAuthSession"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  PRIMARY KEY ("sessionId", "name")
);
