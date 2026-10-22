import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __mockDb: any
}

const prismaInstance =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance

export const db: PrismaClient = new Proxy(prismaInstance as any, {
  get(target, prop) {
    if (globalForPrisma.__mockDb && prop in globalForPrisma.__mockDb) {
      return globalForPrisma.__mockDb[prop]
    }
    return (target as any)[prop]
  },
})