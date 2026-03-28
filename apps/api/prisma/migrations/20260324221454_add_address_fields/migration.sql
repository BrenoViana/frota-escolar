-- AlterTable
ALTER TABLE "School" ADD COLUMN     "cep" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "cep" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "garageCep" TEXT,
ADD COLUMN     "garageCity" TEXT,
ADD COLUMN     "garageLat" DOUBLE PRECISION,
ADD COLUMN     "garageLng" DOUBLE PRECISION,
ADD COLUMN     "garageNumber" TEXT,
ADD COLUMN     "garageState" TEXT,
ADD COLUMN     "garageStreet" TEXT;
