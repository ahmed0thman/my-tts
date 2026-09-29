-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "audioPath" TEXT NOT NULL,
    "duration" REAL NOT NULL,
    "fileSize" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Generation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "audioPath" TEXT,
    "savedPath" TEXT,
    "modelId" TEXT NOT NULL DEFAULT 'silma',
    "params" JSONB,
    "voiceProfileId" TEXT,
    "speed" REAL NOT NULL DEFAULT 1.0,
    "cfgStrength" REAL NOT NULL DEFAULT 2.0,
    "nfeStep" INTEGER NOT NULL DEFAULT 16,
    "seed" TEXT,
    "duration" REAL,
    "fileSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "episodeId" TEXT,
    "position" INTEGER,
    "editedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'tts',
    CONSTRAINT "Generation_voiceProfileId_fkey" FOREIGN KEY ("voiceProfileId") REFERENCES "VoiceProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Generation_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Generation" ("audioPath", "cfgStrength", "createdAt", "duration", "editedAt", "episodeId", "error", "fileSize", "id", "modelId", "nfeStep", "params", "position", "savedPath", "seed", "speed", "status", "text", "voiceProfileId") SELECT "audioPath", "cfgStrength", "createdAt", "duration", "editedAt", "episodeId", "error", "fileSize", "id", "modelId", "nfeStep", "params", "position", "savedPath", "seed", "speed", "status", "text", "voiceProfileId" FROM "Generation";
DROP TABLE "Generation";
ALTER TABLE "new_Generation" RENAME TO "Generation";
CREATE INDEX "Generation_createdAt_idx" ON "Generation"("createdAt" DESC);
CREATE INDEX "Generation_voiceProfileId_idx" ON "Generation"("voiceProfileId");
CREATE INDEX "Generation_status_idx" ON "Generation"("status");
CREATE INDEX "Generation_episodeId_position_idx" ON "Generation"("episodeId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Clip_createdAt_idx" ON "Clip"("createdAt" DESC);
