-- CreateTable
CREATE TABLE "financial_evidence_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "parseVersion" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "analysisScope" TEXT NOT NULL,
    "periodYear" INTEGER,
    "periodMonth" INTEGER,
    "sourceSheetCount" INTEGER NOT NULL,
    "importedSheetCount" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "numericCellCount" INTEGER NOT NULL,
    "textCellCount" INTEGER NOT NULL,
    "redactionCount" INTEGER NOT NULL,
    "originalArchived" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "financial_evidence_documents_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "financial_evidence_sheets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "sheetIndex" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "sourceRange" TEXT,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,
    "nonEmptyCellCount" INTEGER NOT NULL,
    "formulaCellCount" INTEGER NOT NULL,
    "numericCellCount" INTEGER NOT NULL,
    "textCellCount" INTEGER NOT NULL,
    "redactionCount" INTEGER NOT NULL,
    CONSTRAINT "financial_evidence_sheets_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "financial_evidence_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "financial_evidence_rows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "rowKind" TEXT NOT NULL,
    "valuesJson" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "numericCellCount" INTEGER NOT NULL,
    "textCellCount" INTEGER NOT NULL,
    "redactionCount" INTEGER NOT NULL,
    CONSTRAINT "financial_evidence_rows_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "financial_evidence_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_evidence_documents_sourceKey_key" ON "financial_evidence_documents"("sourceKey");

-- CreateIndex
CREATE INDEX "financial_evidence_documents_periodYear_periodMonth_category_idx" ON "financial_evidence_documents"("periodYear", "periodMonth", "category");

-- CreateIndex
CREATE INDEX "financial_evidence_documents_contentSha256_idx" ON "financial_evidence_documents"("contentSha256");

-- CreateIndex
CREATE INDEX "financial_evidence_documents_periodId_idx" ON "financial_evidence_documents"("periodId");

-- CreateIndex
CREATE INDEX "financial_evidence_sheets_documentId_idx" ON "financial_evidence_sheets"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_evidence_sheets_documentId_sheetIndex_key" ON "financial_evidence_sheets"("documentId", "sheetIndex");

-- CreateIndex
CREATE INDEX "financial_evidence_rows_sheetId_rowKind_idx" ON "financial_evidence_rows"("sheetId", "rowKind");

-- CreateIndex
CREATE UNIQUE INDEX "financial_evidence_rows_sheetId_sourceRow_key" ON "financial_evidence_rows"("sheetId", "sourceRow");
