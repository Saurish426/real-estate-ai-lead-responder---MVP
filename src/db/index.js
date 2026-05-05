const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

let prisma;

function getPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required before connecting to Prisma.");
  }

  // Reuse one Prisma client while the server is running.
  // This avoids opening a brand-new database connection for every request.
  if (!prisma) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL
    });

    prisma = new PrismaClient({
      adapter
    });
  }

  return prisma;
}

module.exports = {
  getPrismaClient
};
