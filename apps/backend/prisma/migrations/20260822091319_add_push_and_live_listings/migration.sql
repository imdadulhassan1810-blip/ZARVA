-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pushToken" TEXT;
