-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "friends" TEXT[],
    "friendRequests" TEXT[],

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "projectId" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "image" BYTEA,
    "adminId" TEXT NOT NULL,
    "workspace" TEXT,
    "document" TEXT,
    "githubRepo" TEXT NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "_projectmembers" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectId_key" ON "Project"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_adminId_key" ON "Project"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "_projectmembers_AB_unique" ON "_projectmembers"("A", "B");

-- CreateIndex
CREATE INDEX "_projectmembers_B_index" ON "_projectmembers"("B");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_projectmembers" ADD CONSTRAINT "_projectmembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_projectmembers" ADD CONSTRAINT "_projectmembers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
