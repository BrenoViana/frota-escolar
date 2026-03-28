-- DropForeignKey
ALTER TABLE "Route" DROP CONSTRAINT "Route_schoolId_fkey";

-- AlterTable
ALTER TABLE "Route" ALTER COLUMN "schoolId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
