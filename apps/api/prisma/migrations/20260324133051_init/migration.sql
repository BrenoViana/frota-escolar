-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "students" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "routes" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "pickupWindow" TEXT NOT NULL,
    "dropoffWindow" TEXT NOT NULL,
    "manager" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "routeList" JSONB NOT NULL,
    "contacts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);
