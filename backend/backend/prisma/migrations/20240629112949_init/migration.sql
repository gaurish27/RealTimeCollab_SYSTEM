/*
  Warnings:

  - The primary key for the `Project` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "_pendingmembers" DROP CONSTRAINT "_pendingmembers_A_fkey";

-- DropForeignKey
ALTER TABLE "_projectmembers" DROP CONSTRAINT "_projectmembers_A_fkey";

-- AlterTable
ALTER TABLE "Project" DROP CONSTRAINT "Project_pkey",
ALTER COLUMN "projectId" DROP DEFAULT,
ALTER COLUMN "projectId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Project_pkey" PRIMARY KEY ("projectId");
DROP SEQUENCE "Project_projectId_seq";

-- AlterTable
ALTER TABLE "_pendingmembers" ALTER COLUMN "A" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "_projectmembers" ALTER COLUMN "A" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "_projectmembers" ADD CONSTRAINT "_projectmembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_pendingmembers" ADD CONSTRAINT "_pendingmembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;
