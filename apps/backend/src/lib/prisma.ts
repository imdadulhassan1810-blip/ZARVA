import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across hot reloads in dev.
export const prisma = new PrismaClient();
