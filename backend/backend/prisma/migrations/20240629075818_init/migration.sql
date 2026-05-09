-- CreateTable
CREATE TABLE "_pendingmembers" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_pendingmembers_AB_unique" ON "_pendingmembers"("A", "B");

-- CreateIndex
CREATE INDEX "_pendingmembers_B_index" ON "_pendingmembers"("B");

-- AddForeignKey
ALTER TABLE "_pendingmembers" ADD CONSTRAINT "_pendingmembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_pendingmembers" ADD CONSTRAINT "_pendingmembers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
