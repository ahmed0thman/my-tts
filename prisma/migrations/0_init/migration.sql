-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "referenceAudioPath" TEXT NOT NULL,
    "referenceText" TEXT NOT NULL DEFAULT '',
    "duration" REAL NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Generation" (
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
    CONSTRAINT "Generation_voiceProfileId_fkey" FOREIGN KEY ("voiceProfileId") REFERENCES "VoiceProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Generation_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'episode',
    "modelId" TEXT,
    "voiceProfileId" TEXT,
    "params" JSONB,
    "outputDir" TEXT,
    "gapMs" INTEGER NOT NULL DEFAULT 350,
    "mergedAudioPath" TEXT,
    "mergedSavedPath" TEXT,
    "mergedDuration" REAL,
    "mergedAt" DATETIME,
    "mergedSignature" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Episode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Preset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "modelId" TEXT NOT NULL DEFAULT 'silma',
    "params" JSONB,
    "speed" REAL NOT NULL DEFAULT 1.0,
    "cfgStrength" REAL NOT NULL DEFAULT 2.0,
    "nfeStep" INTEGER NOT NULL DEFAULT 16,
    "voiceProfileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Generation_createdAt_idx" ON "Generation"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Generation_voiceProfileId_idx" ON "Generation"("voiceProfileId");

-- CreateIndex
CREATE INDEX "Generation_status_idx" ON "Generation"("status");

-- CreateIndex
CREATE INDEX "Generation_episodeId_position_idx" ON "Generation"("episodeId", "position");

-- CreateIndex
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Episode_projectId_createdAt_idx" ON "Episode"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Preset_name_modelId_key" ON "Preset"("name", "modelId");

