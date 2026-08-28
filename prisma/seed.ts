import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// =================================================================
// AI Revenue Recovery — Deterministic Seed Script
// All monetary amounts are in PAISE (Int). Divide by 100 for ₹.
// No Math.random() — every value is hardcoded for reproducibility.
// =================================================================

// Use relative timestamps so decisions don't expire in demo mode.
// T.d24 is ~10 minutes ago (fresh for 24h expiry). Other dates spread backward.
const NOW = new Date()
const DAY = 86400_000
const HOUR = 3600_000
const T = {
  d1:  new Date(NOW.getTime() - 25 * DAY),
  d2:  new Date(NOW.getTime() - 24 * DAY),
  d3:  new Date(NOW.getTime() - 23 * DAY),
  d4:  new Date(NOW.getTime() - 22 * DAY),
  d5:  new Date(NOW.getTime() - 21 * DAY),
  d6:  new Date(NOW.getTime() - 20 * DAY),
  d7:  new Date(NOW.getTime() - 19 * DAY),
  d8:  new Date(NOW.getTime() - 18 * DAY),
  d9:  new Date(NOW.getTime() - 17 * DAY),
  d10: new Date(NOW.getTime() - 16 * DAY),
  d11: new Date(NOW.getTime() - 15 * DAY),
  d12: new Date(NOW.getTime() - 14 * DAY),
  d13: new Date(NOW.getTime() - 13 * DAY),
  d14: new Date(NOW.getTime() - 12 * DAY),
  d15: new Date(NOW.getTime() - 11 * DAY),
  d16: new Date(NOW.getTime() - 10 * DAY),
  d17: new Date(NOW.getTime() - 9 * DAY),
  d18: new Date(NOW.getTime() - 8 * DAY),
  d19: new Date(NOW.getTime() - 7 * DAY),
  d20: new Date(NOW.getTime() - 6 * DAY),
  d21: new Date(NOW.getTime() - 5 * DAY),
  d22: new Date(NOW.getTime() - 4 * DAY),
  d23: new Date(NOW.getTime() - 3 * DAY),
  d24: new Date(NOW.getTime() - 10 * HOUR),
  d25: new Date(NOW.getTime() - 5 * HOUR),
}

async function main() {
  console.log('Seeding database — AI Revenue Recovery platform')

  // ----------------------------------------------------------------
  // 1. DELETE in reverse dependency order
  // ----------------------------------------------------------------
  console.log('\nCleaning existing data...')
  const delAudit = await prisma.auditEvent.deleteMany()
  console.log(`  AuditEvent:      ${delAudit.count} deleted`)
  const delComm = await prisma.communicationEvent.deleteMany()
  console.log(`  CommunicationEvent: ${delComm.count} deleted`)
  const delAttempts = await prisma.recoveryAttempt.deleteMany()
  console.log(`  RecoveryAttempt: ${delAttempts.count} deleted`)
  const delDecisions = await prisma.agentDecision.deleteMany()
  console.log(`  AgentDecision:   ${delDecisions.count} deleted`)
  const delCases = await prisma.recoveryCase.deleteMany()
  console.log(`  RecoveryCase:    ${delCases.count} deleted`)
  const delSubs = await prisma.subscription.deleteMany()
  console.log(`  Subscription:    ${delSubs.count} deleted`)
  const delCheckouts = await prisma.checkout.deleteMany()
  console.log(`  Checkout:        ${delCheckouts.count} deleted`)
  const delPayments = await prisma.payment.deleteMany()
  console.log(`  Payment:         ${delPayments.count} deleted`)
  const delCustomers = await prisma.customer.deleteMany()
  console.log(`  Customer:        ${delCustomers.count} deleted`)
  const delMerchants = await prisma.merchant.deleteMany()
  console.log(`  Merchant:        ${delMerchants.count} deleted`)

  // ----------------------------------------------------------------
  // 2. MERCHANTS (2)
  // ----------------------------------------------------------------
  console.log('\nSeeding Merchants...')

  const merchantA = await prisma.merchant.create({
    data: {
      id: 'merchant_tech_nova',
      name: 'TechNova Electronics',
      email: 'technova@example.com',
      industry: 'ecommerce',
      createdAt: T.d1,
    },
  })

  const merchantB = await prisma.merchant.create({
    data: {
      id: 'merchant_fit_life',
      name: 'FitLife Subscriptions',
      email: 'fitlife@example.com',
      industry: 'saas',
      createdAt: T.d1,
    },
  })

  console.log(`  Merchants: 2 created`)

  // ----------------------------------------------------------------
  // 3. CUSTOMERS (10)
  // ----------------------------------------------------------------
  console.log('\nSeeding Customers...')

  const custA1 = await prisma.customer.create({
    data: { id: 'cust_a1', merchantId: merchantA.id, email: 'arjun.sharma@example.com', phone: '+91-98765-43210', displayName: 'Arjun Sharma', createdAt: T.d2 },
  })
  const custA2 = await prisma.customer.create({
    data: { id: 'cust_a2', merchantId: merchantA.id, email: 'priya.patel@example.com', phone: '+91-91234-56780', displayName: 'Priya Patel', createdAt: T.d2 },
  })
  const custA3 = await prisma.customer.create({
    data: { id: 'cust_a3', merchantId: merchantA.id, email: 'vikram.singh@example.com', phone: '+91-99887-76655', displayName: 'Vikram Singh', createdAt: T.d3 },
  })
  const custA4 = await prisma.customer.create({
    data: { id: 'cust_a4', merchantId: merchantA.id, email: 'ananya.reddy@example.com', phone: '+91-97766-55443', displayName: 'Ananya Reddy', createdAt: T.d3 },
  })
  const custA5 = await prisma.customer.create({
    data: { id: 'cust_a5', merchantId: merchantA.id, email: 'rahul.mehta@example.com', phone: '+91-96554-43322', displayName: 'Rahul Mehta', createdAt: T.d4 },
  })
  const custA6 = await prisma.customer.create({
    data: { id: 'cust_a6', merchantId: merchantA.id, email: 'sneha.kulkarni@example.com', phone: '+91-95443-32211', displayName: 'Sneha Kulkarni', createdAt: T.d4 },
  })
  const custB1 = await prisma.customer.create({
    data: { id: 'cust_b1', merchantId: merchantB.id, email: 'dev.kapoor@example.com', phone: '+91-94332-21100', displayName: 'Dev Kapoor', createdAt: T.d2 },
  })
  const custB2 = await prisma.customer.create({
    data: { id: 'cust_b2', merchantId: merchantB.id, email: 'meera.nair@example.com', phone: '+91-93221-10099', displayName: 'Meera Nair', createdAt: T.d3 },
  })
  const custB3 = await prisma.customer.create({
    data: { id: 'cust_b3', merchantId: merchantB.id, email: 'aryan.joshi@example.com', phone: '+91-92110-09988', displayName: 'Aryan Joshi', createdAt: T.d4 },
  })
  const custB4 = await prisma.customer.create({
    data: { id: 'cust_b4', merchantId: merchantB.id, email: 'ishita.gupta@example.com', phone: '+91-91099-98877', displayName: 'Ishita Gupta', createdAt: T.d5 },
  })

  // DND test customers (Feature 5)
  const custDnd1 = await prisma.customer.create({
    data: { id: 'cust_dnd1', merchantId: merchantA.id, email: 'dnd.global@example.com', phone: '+91-90000-00001', displayName: 'DND Global Customer', createdAt: T.d3, doNotContact: true, optedOutAt: T.d5, optOutReason: 'Too many messages', optOutSource: 'CUSTOMER' },
  })
  const custDnd2 = await prisma.customer.create({
    data: { id: 'cust_dnd2', merchantId: merchantA.id, email: 'dnd.channel@example.com', phone: '+91-90000-00002', displayName: 'DND Channel Customer', createdAt: T.d4, emailOptOut: true, optedOutAt: T.d6, optOutReason: 'Unsubscribe from email', optOutSource: 'CUSTOMER' },
  })

  // Additional TechNova customers (cust_a7 to cust_a14)
  const custA7  = await prisma.customer.create({ data: { id: 'cust_a7',  merchantId: merchantA.id, email: 'kiran.desai@example.com',    phone: '+91-89988-77665', displayName: 'Kiran Desai',    createdAt: T.d6 } })
  const custA8  = await prisma.customer.create({ data: { id: 'cust_a8',  merchantId: merchantA.id, email: 'nisha.roy@example.com',      phone: '+91-88877-66554', displayName: 'Nisha Roy',      createdAt: T.d7 } })
  const custA9  = await prisma.customer.create({ data: { id: 'cust_a9',  merchantId: merchantA.id, email: 'rohit.jain@example.com',    phone: '+91-87766-55443', displayName: 'Rohit Jain',     createdAt: T.d8 } })
  const custA10 = await prisma.customer.create({ data: { id: 'cust_a10', merchantId: merchantA.id, email: 'pooja.verma@example.com',   phone: '+91-86655-44332', displayName: 'Pooja Verma',   createdAt: T.d9 } })
  const custA11 = await prisma.customer.create({ data: { id: 'cust_a11', merchantId: merchantA.id, email: 'amit.malhotra@example.com',phone: '+91-85544-33221', displayName: 'Amit Malhotra', createdAt: T.d10 } })
  const custA12 = await prisma.customer.create({ data: { id: 'cust_a12', merchantId: merchantA.id, email: 'divya.saxena@example.com', phone: '+91-84433-22110', displayName: 'Divya Saxena',  createdAt: T.d11 } })
  const custA13 = await prisma.customer.create({ data: { id: 'cust_a13', merchantId: merchantA.id, email: 'suresh.pillai@example.com',phone: '+91-83322-11099', displayName: 'Suresh Pillai', createdAt: T.d12 } })
  const custA14 = await prisma.customer.create({ data: { id: 'cust_a14', merchantId: merchantA.id, email: 'tanya.bhattacharya@example.com',phone: '+91-82211-00998',displayName: 'Tanya Bhattacharya', createdAt: T.d13 } })

  // Additional FitLife customers (cust_b5 to cust_b10)
  const custB5  = await prisma.customer.create({ data: { id: 'cust_b5',  merchantId: merchantB.id, email: 'karthik.rao@example.com',  phone: '+91-81100-99876', displayName: 'Karthik Rao',   createdAt: T.d6 } })
  const custB6  = await prisma.customer.create({ data: { id: 'cust_b6',  merchantId: merchantB.id, email: 'sanjana.das@example.com',  phone: '+91-80099-88765', displayName: 'Sanjana Das',  createdAt: T.d7 } })
  const custB7  = await prisma.customer.create({ data: { id: 'cust_b7',  merchantId: merchantB.id, email: 'varun.menon@example.com',  phone: '+91-79088-77654', displayName: 'Varun Menon',  createdAt: T.d8 } })
  const custB8  = await prisma.customer.create({ data: { id: 'cust_b8',  merchantId: merchantB.id, email: 'aisha.khan@example.com',   phone: '+91-78077-66543', displayName: 'Aisha Khan',   createdAt: T.d9 } })
  const custB9  = await prisma.customer.create({ data: { id: 'cust_b9',  merchantId: merchantB.id, email: 'nikhil.shukla@example.com',phone: '+91-77066-55432', displayName: 'Nikhil Shukla', createdAt: T.d10 } })
  const custB10 = await prisma.customer.create({ data: { id: 'cust_b10', merchantId: merchantB.id, email: 'ritu.agarwal@example.com', phone: '+91-76055-44321', displayName: 'Ritu Agarwal',  createdAt: T.d11 } })

  console.log(`  Customers: 26 created (14 TechNova, 10 FitLife, 2 DND test)`)

  // ----------------------------------------------------------------
  // 4. PAYMENTS (55)
  // ----------------------------------------------------------------
  console.log('\nSeeding Payments...')

  // Merchant A — 12 payments
  const payA1 = await prisma.payment.create({
    data: { id: 'pay_a1', merchantId: merchantA.id, customerId: custA1.id, externalId: 'pay_ext_tn_001', amount: 249900, currency: 'INR', status: 'captured', method: 'upi', description: 'Wireless Earbuds Pro', createdAt: T.d2, updatedAt: T.d2 },
  })
  const payA2 = await prisma.payment.create({
    data: { id: 'pay_a2', merchantId: merchantA.id, customerId: custA2.id, externalId: 'pay_ext_tn_002', amount: 129900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'BAD_REQUEST', failureReason: 'Card declined by issuer — insufficient funds', description: 'Ergonomic Laptop Stand', createdAt: T.d3, updatedAt: T.d3 },
  })
  const payA3 = await prisma.payment.create({
    data: { id: 'pay_a3', merchantId: merchantA.id, customerId: custA3.id, externalId: 'pay_ext_tn_003', amount: 459900, currency: 'INR', status: 'captured', method: 'netbanking', description: 'Mechanical Keyboard RGB', createdAt: T.d3, updatedAt: T.d3 },
  })
  const payA4 = await prisma.payment.create({
    data: { id: 'pay_a4', merchantId: merchantA.id, customerId: custA4.id, externalId: 'pay_ext_tn_004', amount: 219900, currency: 'INR', status: 'failed', method: 'upi', failureCode: 'TIMED_OUT', failureReason: 'UPI payment timed out — customer did not authenticate within 120s', description: 'USB-C 7-in-1 Hub', createdAt: T.d4, updatedAt: T.d4 },
  })
  const payA5 = await prisma.payment.create({
    data: { id: 'pay_a5', merchantId: merchantA.id, customerId: custA5.id, externalId: 'pay_ext_tn_005', amount: 899900, currency: 'INR', status: 'refunded', method: 'card', amountRefunded: 899900, description: 'Smart Watch Series X', createdAt: T.d5, updatedAt: T.d6 },
  })
  const payA6 = await prisma.payment.create({
    data: { id: 'pay_a6', merchantId: merchantA.id, customerId: custA6.id, externalId: 'pay_ext_tn_006', amount: 79900, currency: 'INR', status: 'captured', method: 'wallet', description: 'Premium Phone Case', createdAt: T.d5, updatedAt: T.d5 },
  })
  const payA7 = await prisma.payment.create({
    data: { id: 'pay_a7', merchantId: merchantA.id, customerId: custA1.id, externalId: 'pay_ext_tn_007', amount: 1599900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'PAYMENT_ERROR', failureReason: 'Bank gateway returned error — possible network issue at bank end', description: '27-inch 4K Monitor', createdAt: T.d6, updatedAt: T.d6 },
  })
  const payA8 = await prisma.payment.create({
    data: { id: 'pay_a8', merchantId: merchantA.id, customerId: custA3.id, externalId: 'pay_ext_tn_008', amount: 349900, currency: 'INR', status: 'captured', method: 'emi', description: 'Webcam 4K Ultra HD', createdAt: T.d7, updatedAt: T.d7 },
  })
  const payA9 = await prisma.payment.create({
    data: { id: 'pay_a9', merchantId: merchantA.id, customerId: custA2.id, externalId: 'pay_ext_tn_009', amount: 699900, currency: 'INR', status: 'failed', method: 'upi', failureCode: 'INVALID_VPA', failureReason: 'Invalid UPI VPA handle provided by customer', description: 'Noise Cancelling Headphones', createdAt: T.d8, updatedAt: T.d8 },
  })
  const payA10 = await prisma.payment.create({
    data: { id: 'pay_a10', merchantId: merchantA.id, customerId: custA5.id, externalId: 'pay_ext_tn_010', amount: 199900, currency: 'INR', status: 'cancelled', method: 'card', description: 'Portable SSD 1TB', createdAt: T.d8, updatedAt: T.d9 },
  })
  const payA11 = await prisma.payment.create({
    data: { id: 'pay_a11', merchantId: merchantA.id, customerId: custA4.id, externalId: 'pay_ext_tn_011', amount: 599900, currency: 'INR', status: 'captured', method: 'netbanking', description: 'Wireless Charging Pad', createdAt: T.d9, updatedAt: T.d9 },
  })
  const payA12 = await prisma.payment.create({
    data: { id: 'pay_a12', merchantId: merchantA.id, customerId: custA6.id, externalId: 'pay_ext_tn_012', amount: 499900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'AUTHENTICATION_FAILED', failureReason: '3D Secure authentication failed — wrong OTP entered twice', description: 'Bluetooth Speaker', createdAt: T.d10, updatedAt: T.d10 },
  })

  // Merchant B — 8 payments
  const payB1 = await prisma.payment.create({
    data: { id: 'pay_b1', merchantId: merchantB.id, customerId: custB1.id, externalId: 'pay_ext_fl_001', amount: 149900, currency: 'INR', status: 'captured', method: 'card', description: 'FitLife Annual Plan', createdAt: T.d2, updatedAt: T.d2 },
  })
  const payB2 = await prisma.payment.create({
    data: { id: 'pay_b2', merchantId: merchantB.id, customerId: custB2.id, externalId: 'pay_ext_fl_002', amount: 49900, currency: 'INR', status: 'failed', method: 'upi', failureCode: 'TIMED_OUT', failureReason: 'Customer closed UPI app before completing payment', description: 'FitLife Monthly Plan', createdAt: T.d4, updatedAt: T.d4 },
  })
  const payB3 = await prisma.payment.create({
    data: { id: 'pay_b3', merchantId: merchantB.id, customerId: custB3.id, externalId: 'pay_ext_fl_003', amount: 149900, currency: 'INR', status: 'captured', method: 'netbanking', description: 'FitLife Annual Plan', createdAt: T.d5, updatedAt: T.d5 },
  })
  const payB4 = await prisma.payment.create({
    data: { id: 'pay_b4', merchantId: merchantB.id, customerId: custB4.id, externalId: 'pay_ext_fl_004', amount: 49900, currency: 'INR', status: 'refunded', method: 'card', amountRefunded: 49900, description: 'FitLife Monthly Plan', createdAt: T.d6, updatedAt: T.d7 },
  })
  const payB5 = await prisma.payment.create({
    data: { id: 'pay_b5', merchantId: merchantB.id, customerId: custB1.id, externalId: 'pay_ext_fl_005', amount: 49900, currency: 'INR', status: 'failed', method: 'upi', failureCode: 'BAD_REQUEST', failureReason: 'UPI mandate registration failed — bank rejected auto-debit', description: 'FitLife Monthly Renewal', createdAt: T.d9, updatedAt: T.d9 },
  })
  const payB6 = await prisma.payment.create({
    data: { id: 'pay_b6', merchantId: merchantB.id, customerId: custB2.id, externalId: 'pay_ext_fl_006', amount: 149900, currency: 'INR', status: 'captured', method: 'card', description: 'FitLife Annual Plan', createdAt: T.d10, updatedAt: T.d10 },
  })
  const payB7 = await prisma.payment.create({
    data: { id: 'pay_b7', merchantId: merchantB.id, customerId: custB3.id, externalId: 'pay_ext_fl_007', amount: 49900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'PAYMENT_ERROR', failureReason: 'Card expiry date passed — card expired in Jan 2025', description: 'FitLife Monthly Renewal', createdAt: T.d11, updatedAt: T.d11 },
  })
  const payB8 = await prisma.payment.create({
    data: { id: 'pay_b8', merchantId: merchantB.id, customerId: custB4.id, externalId: 'pay_ext_fl_008', amount: 129900, currency: 'INR', status: 'captured', method: 'upi', description: 'FitLife Quarterly Plan', createdAt: T.d12, updatedAt: T.d12 },
  })

  // Additional TechNova payments (payA13–payA30)
  const payA13 = await prisma.payment.create({ data: { id: 'pay_a13', merchantId: merchantA.id, customerId: custA7.id, externalId: 'pay_ext_tn_013', amount: 149900, currency: 'INR', status: 'captured', method: 'upi', description: 'Wireless Mouse Pro', createdAt: T.d6, updatedAt: T.d6 } })
  const payA14 = await prisma.payment.create({ data: { id: 'pay_a14', merchantId: merchantA.id, customerId: custA8.id, externalId: 'pay_ext_tn_014', amount: 599900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'BAD_REQUEST', failureReason: 'Card declined — insufficient funds', description: 'Mechanical Keyboard RGB', createdAt: T.d7, updatedAt: T.d7 } })
  const payA15 = await prisma.payment.create({ data: { id: 'pay_a15', merchantId: merchantA.id, customerId: custA9.id, externalId: 'pay_ext_tn_015', amount: 349900, currency: 'INR', status: 'captured', method: 'netbanking', description: 'Webcam 4K Ultra HD', createdAt: T.d8, updatedAt: T.d8 } })
  const payA16 = await prisma.payment.create({ data: { id: 'pay_a16', merchantId: merchantA.id, customerId: custA10.id, externalId: 'pay_ext_tn_016', amount: 89900, currency: 'INR', status: 'captured', method: 'wallet', description: 'Phone Case Premium', createdAt: T.d9, updatedAt: T.d9 } })
  const payA17 = await prisma.payment.create({ data: { id: 'pay_a17', merchantId: merchantA.id, customerId: custA11.id, externalId: 'pay_ext_tn_017', amount: 1299900, currency: 'INR', status: 'failed', method: 'upi', failureCode: 'TIMED_OUT', failureReason: 'UPI timeout — customer did not authenticate', description: '4K Monitor 27-inch', createdAt: T.d10, updatedAt: T.d10 } })
  const payA18 = await prisma.payment.create({ data: { id: 'pay_a18', merchantId: merchantA.id, customerId: custA12.id, externalId: 'pay_ext_tn_018', amount: 199900, currency: 'INR', status: 'captured', method: 'card', description: 'USB-C Hub 7-in-1', createdAt: T.d11, updatedAt: T.d11 } })
  const payA19 = await prisma.payment.create({ data: { id: 'pay_a19', merchantId: merchantA.id, customerId: custA13.id, externalId: 'pay_ext_tn_019', amount: 449900, currency: 'INR', status: 'failed', method: 'upi', failureCode: 'INVALID_VPA', failureReason: 'Customer entered incorrect UPI handle', description: 'Bluetooth Speaker Pro', createdAt: T.d12, updatedAt: T.d12 } })
  const payA20 = await prisma.payment.create({ data: { id: 'pay_a20', merchantId: merchantA.id, customerId: custA14.id, externalId: 'pay_ext_tn_020', amount: 79900, currency: 'INR', status: 'captured', method: 'emi', description: 'Screen Protector Pack', createdAt: T.d13, updatedAt: T.d13 } })
  const payA21 = await prisma.payment.create({ data: { id: 'pay_a21', merchantId: merchantA.id, customerId: custA7.id, externalId: 'pay_ext_tn_021', amount: 249900, currency: 'INR', status: 'captured', method: 'card', description: 'Wireless Earbuds Pro', createdAt: T.d14, updatedAt: T.d14 } })
  const payA22 = await prisma.payment.create({ data: { id: 'pay_a22', merchantId: merchantA.id, customerId: custA9.id, externalId: 'pay_ext_tn_022', amount: 349900, currency: 'INR', status: 'refunded', method: 'upi', amountRefunded: 349900, description: 'Webcam 4K — returned as defective', createdAt: T.d15, updatedAt: T.d16 } })
  const payA23 = await prisma.payment.create({ data: { id: 'pay_a23', merchantId: merchantA.id, customerId: custA8.id, externalId: 'pay_ext_tn_023', amount: 599900, currency: 'INR', status: 'captured', method: 'netbanking', description: 'Mechanical Keyboard RGB — second attempt', createdAt: T.d16, updatedAt: T.d16 } })
  const payA24 = await prisma.payment.create({ data: { id: 'pay_a24', merchantId: merchantA.id, customerId: custA10.id, externalId: 'pay_ext_tn_024', amount: 299900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'AUTHENTICATION_FAILED', failureReason: '3D Secure authentication failed', description: 'Wireless Charging Pad', createdAt: T.d17, updatedAt: T.d17 } })
  const payA25 = await prisma.payment.create({ data: { id: 'pay_a25', merchantId: merchantA.id, customerId: custA11.id, externalId: 'pay_ext_tn_025', amount: 1299900, currency: 'INR', status: 'captured', method: 'card', description: '4K Monitor — retry succeeded', createdAt: T.d18, updatedAt: T.d18 } })
  const payA26 = await prisma.payment.create({ data: { id: 'pay_a26', merchantId: merchantA.id, customerId: custA12.id, externalId: 'pay_ext_tn_026', amount: 199900, currency: 'INR', status: 'cancelled', method: 'upi', description: 'USB-C Hub — customer cancelled', createdAt: T.d19, updatedAt: T.d19 } })
  const payA27 = await prisma.payment.create({ data: { id: 'pay_a27', merchantId: merchantA.id, customerId: custA13.id, externalId: 'pay_ext_tn_027', amount: 449900, currency: 'INR', status: 'captured', method: 'wallet', description: 'Bluetooth Speaker — retry with wallet', createdAt: T.d20, updatedAt: T.d20 } })
  const payA28 = await prisma.payment.create({ data: { id: 'pay_a28', merchantId: merchantA.id, customerId: custA14.id, externalId: 'pay_ext_tn_028', amount: 179900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'PAYMENT_ERROR', failureReason: 'Bank gateway error during processing', description: 'Portable SSD 256GB', createdAt: T.d21, updatedAt: T.d21 } })
  const payA29 = await prisma.payment.create({ data: { id: 'pay_a29', merchantId: merchantA.id, customerId: custA1.id, externalId: 'pay_ext_tn_029', amount: 999900, currency: 'INR', status: 'captured', method: 'upi', description: 'Smart Watch Series X', createdAt: T.d22, updatedAt: T.d22 } })
  const payA30 = await prisma.payment.create({ data: { id: 'pay_a30', merchantId: merchantA.id, customerId: custA3.id, externalId: 'pay_ext_tn_030', amount: 249900, currency: 'INR', status: 'captured', method: 'card', description: 'Wireless Earbuds — repeat purchase', createdAt: T.d23, updatedAt: T.d23 } })

  // Additional FitLife payments (payB9–payB22)
  const payB9  = await prisma.payment.create({ data: { id: 'pay_b9',  merchantId: merchantB.id, customerId: custB5.id, externalId: 'pay_ext_fl_009', amount: 149900, currency: 'INR', status: 'captured', method: 'card', description: 'FitLife Annual Plan', createdAt: T.d7, updatedAt: T.d7 } })
  const payB10 = await prisma.payment.create({ data: { id: 'pay_b10', merchantId: merchantB.id, customerId: custB6.id, externalId: 'pay_ext_fl_010', amount: 49900, currency: 'INR', status: 'failed', method: 'upi', failureCode: 'TIMED_OUT', failureReason: 'UPI timeout on monthly payment', description: 'FitLife Monthly Plan', createdAt: T.d8, updatedAt: T.d8 } })
  const payB11 = await prisma.payment.create({ data: { id: 'pay_b11', merchantId: merchantB.id, customerId: custB7.id, externalId: 'pay_ext_fl_011', amount: 129900, currency: 'INR', status: 'captured', method: 'netbanking', description: 'FitLife Quarterly Plan', createdAt: T.d9, updatedAt: T.d9 } })
  const payB12 = await prisma.payment.create({ data: { id: 'pay_b12', merchantId: merchantB.id, customerId: custB8.id, externalId: 'pay_ext_fl_012', amount: 49900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'BAD_REQUEST', failureReason: 'Card declined by issuer', description: 'FitLife Monthly Plan', createdAt: T.d10, updatedAt: T.d10 } })
  const payB13 = await prisma.payment.create({ data: { id: 'pay_b13', merchantId: merchantB.id, customerId: custB9.id, externalId: 'pay_ext_fl_013', amount: 149900, currency: 'INR', status: 'captured', method: 'upi', description: 'FitLife Annual Plan', createdAt: T.d11, updatedAt: T.d11 } })
  const payB14 = await prisma.payment.create({ data: { id: 'pay_b14', merchantId: merchantB.id, customerId: custB10.id, externalId: 'pay_ext_fl_014', amount: 49900, currency: 'INR', status: 'failed', method: 'upi', failureCode: 'INVALID_VPA', failureReason: 'Wrong UPI handle entered', description: 'FitLife Monthly Plan', createdAt: T.d12, updatedAt: T.d12 } })
  const payB15 = await prisma.payment.create({ data: { id: 'pay_b15', merchantId: merchantB.id, customerId: custB5.id, externalId: 'pay_ext_fl_015', amount: 49900, currency: 'INR', status: 'captured', method: 'card', description: 'FitLife Monthly Renewal', createdAt: T.d13, updatedAt: T.d13 } })
  const payB16 = await prisma.payment.create({ data: { id: 'pay_b16', merchantId: merchantB.id, customerId: custB6.id, externalId: 'pay_ext_fl_016', amount: 49900, currency: 'INR', status: 'captured', method: 'upi', description: 'FitLife Monthly — retry succeeded', createdAt: T.d14, updatedAt: T.d14 } })
  const payB17 = await prisma.payment.create({ data: { id: 'pay_b17', merchantId: merchantB.id, customerId: custB7.id, externalId: 'pay_ext_fl_017', amount: 129900, currency: 'INR', status: 'refunded', method: 'card', amountRefunded: 129900, description: 'FitLife Quarterly — refunded', createdAt: T.d15, updatedAt: T.d16 } })
  const payB18 = await prisma.payment.create({ data: { id: 'pay_b18', merchantId: merchantB.id, customerId: custB8.id, externalId: 'pay_ext_fl_018', amount: 49900, currency: 'INR', status: 'captured', method: 'wallet', description: 'FitLife Monthly — retry with wallet', createdAt: T.d17, updatedAt: T.d17 } })
  const payB19 = await prisma.payment.create({ data: { id: 'pay_b19', merchantId: merchantB.id, customerId: custB9.id, externalId: 'pay_ext_fl_019', amount: 49900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'PAYMENT_ERROR', failureReason: 'Gateway error during subscription renewal', description: 'FitLife Monthly Renewal', createdAt: T.d18, updatedAt: T.d18 } })
  const payB20 = await prisma.payment.create({ data: { id: 'pay_b20', merchantId: merchantB.id, customerId: custB10.id, externalId: 'pay_ext_fl_020', amount: 149900, currency: 'INR', status: 'captured', method: 'card', description: 'FitLife Annual — retry succeeded', createdAt: T.d19, updatedAt: T.d19 } })
  const payB21 = await prisma.payment.create({ data: { id: 'pay_b21', merchantId: merchantB.id, customerId: custB1.id, externalId: 'pay_ext_fl_021', amount: 49900, currency: 'INR', status: 'captured', method: 'upi', description: 'FitLife Monthly Renewal', createdAt: T.d20, updatedAt: T.d20 } })
  const payB22 = await prisma.payment.create({ data: { id: 'pay_b22', merchantId: merchantB.id, customerId: custB3.id, externalId: 'pay_ext_fl_022', amount: 49900, currency: 'INR', status: 'cancelled', method: 'upi', description: 'FitLife Monthly — customer cancelled', createdAt: T.d21, updatedAt: T.d21 } })

  console.log(`  Payments: 54 created (30 TechNova, 24 FitLife)`)

  // ----------------------------------------------------------------
  // 5. CHECKOUTS (25)
  // ----------------------------------------------------------------
  console.log('\nSeeding Checkouts...')

  // Merchant A — 6 checkouts
  const chkA1 = await prisma.checkout.create({
    data: { id: 'chk_a1', merchantId: merchantA.id, customerId: custA1.id, amount: 749900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"TN-USB-KEY-128","name":"128GB USB Drive","qty":2,"price":74900}]', createdAt: T.d2, updatedAt: T.d2 },
  })
  const chkA2 = await prisma.checkout.create({
    data: { id: 'chk_a2', merchantId: merchantA.id, customerId: custA2.id, amount: 334900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"TN-MOUSE-PRO","name":"Pro Wireless Mouse","qty":1,"price":179900},{"sku":"TN-MOUSEPAD-XL","name":"XL Mousepad","qty":1,"price":155000}]', abandonedAt: T.d4, createdAt: T.d3, updatedAt: T.d4 },
  })
  const chkA3 = await prisma.checkout.create({
    data: { id: 'chk_a3', merchantId: merchantA.id, customerId: custA4.id, amount: 219900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"TN-USBC-HUB","name":"USB-C 7-in-1 Hub","qty":1,"price":219900}]', abandonedAt: T.d5, createdAt: T.d4, updatedAt: T.d5 },
  })
  const chkA4 = await prisma.checkout.create({
    data: { id: 'chk_a4', merchantId: merchantA.id, customerId: custA3.id, amount: 1899900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"TN-MONITOR-27","name":"27-inch 4K Monitor","qty":1,"price":1899900}]', createdAt: T.d5, updatedAt: T.d5 },
  })
  const chkA5 = await prisma.checkout.create({
    data: { id: 'chk_a5', merchantId: merchantA.id, customerId: custA5.id, amount: 459800, currency: 'INR', status: 'expired', itemsJson: '[{"sku":"TN-KEYBOARD-RGB","name":"Mechanical Keyboard RGB","qty":1,"price":329900},{"sku":"TN-CABLE-USBC","name":"USB-C Cable 2m","qty":2,"price":64900}]', createdAt: T.d7, updatedAt: T.d9 },
  })
  const chkA6 = await prisma.checkout.create({
    data: { id: 'chk_a6', merchantId: merchantA.id, customerId: custA6.id, amount: 159900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"TN-STAND-LAP","name":"Ergonomic Laptop Stand","qty":1,"price":159900}]', abandonedAt: T.d11, createdAt: T.d10, updatedAt: T.d11 },
  })

  // Merchant B — 4 checkouts
  const chkB1 = await prisma.checkout.create({
    data: { id: 'chk_b1', merchantId: merchantB.id, customerId: custB1.id, amount: 149900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"FL-PLAN-ANNUAL","name":"Annual Plan","qty":1,"price":149900}]', createdAt: T.d2, updatedAt: T.d2 },
  })
  const chkB2 = await prisma.checkout.create({
    data: { id: 'chk_b2', merchantId: merchantB.id, customerId: custB2.id, amount: 49900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"FL-PLAN-MONTHLY","name":"Monthly Plan","qty":1,"price":49900}]', abandonedAt: T.d5, createdAt: T.d4, updatedAt: T.d5 },
  })
  const chkB3 = await prisma.checkout.create({
    data: { id: 'chk_b3', merchantId: merchantB.id, customerId: custB3.id, amount: 149900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"FL-PLAN-ANNUAL","name":"Annual Plan","qty":1,"price":149900}]', createdAt: T.d5, updatedAt: T.d5 },
  })
  const chkB4 = await prisma.checkout.create({
    data: { id: 'chk_b4', merchantId: merchantB.id, customerId: custB4.id, amount: 129900, currency: 'INR', status: 'expired', itemsJson: '[{"sku":"FL-PLAN-QUARTERLY","name":"Quarterly Plan","qty":1,"price":129900}]', createdAt: T.d8, updatedAt: T.d11 },
  })

  // Additional TechNova checkouts (chkA7–chkA17)
  const chkA7  = await prisma.checkout.create({ data: { id: 'chk_a7',  merchantId: merchantA.id, customerId: custA7.id,  amount: 399900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"TN-KEYBOARD-RGB","name":"Mechanical Keyboard RGB","qty":1,"price":399900}]', createdAt: T.d7, updatedAt: T.d7 } })
  const chkA8  = await prisma.checkout.create({ data: { id: 'chk_a8',  merchantId: merchantA.id, customerId: custA8.id,  amount: 599900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"TN-KEYBOARD-RGB","name":"Mechanical Keyboard RGB","qty":1,"price":599900}]', abandonedAt: T.d8, createdAt: T.d7, updatedAt: T.d8 } })
  const chkA9  = await prisma.checkout.create({ data: { id: 'chk_a9',  merchantId: merchantA.id, customerId: custA9.id,  amount: 699900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"TN-HEADSET-NC","name":"Noise Cancelling Headphones","qty":1,"price":699900}]', createdAt: T.d9, updatedAt: T.d9 } })
  const chkA10 = await prisma.checkout.create({ data: { id: 'chk_a10', merchantId: merchantA.id, customerId: custA11.id, amount: 1299900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"TN-MONITOR-27","name":"27-inch 4K Monitor","qty":1,"price":1299900}]', abandonedAt: T.d11, createdAt: T.d10, updatedAt: T.d11 } })
  const chkA11 = await prisma.checkout.create({ data: { id: 'chk_a11', merchantId: merchantA.id, customerId: custA12.id, amount: 199900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"TN-USBC-HUB","name":"USB-C Hub 7-in-1","qty":1,"price":199900}]', createdAt: T.d12, updatedAt: T.d12 } })
  const chkA12 = await prisma.checkout.create({ data: { id: 'chk_a12', merchantId: merchantA.id, customerId: custA13.id, amount: 449900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"TN-SPEAKER-BT","name":"Bluetooth Speaker Pro","qty":1,"price":449900}]', abandonedAt: T.d13, createdAt: T.d12, updatedAt: T.d13 } })
  const chkA13 = await prisma.checkout.create({ data: { id: 'chk_a13', merchantId: merchantA.id, customerId: custA14.id, amount: 279900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"TN-SSD-512","name":"Portable SSD 512GB","qty":1,"price":279900}]', createdAt: T.d14, updatedAt: T.d14 } })
  const chkA14 = await prisma.checkout.create({ data: { id: 'chk_a14', merchantId: merchantA.id, customerId: custA7.id,  amount: 249900, currency: 'INR', status: 'expired', itemsJson: '[{"sku":"TN-EARBUDS-PRO","name":"Wireless Earbuds Pro","qty":1,"price":249900}]', createdAt: T.d15, updatedAt: T.d17 } })
  const chkA15 = await prisma.checkout.create({ data: { id: 'chk_a15', merchantId: merchantA.id, customerId: custA10.id, amount: 299900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"TN-CHARGER-PAD","name":"Wireless Charging Pad","qty":1,"price":299900}]', abandonedAt: T.d18, createdAt: T.d17, updatedAt: T.d18 } })
  const chkA16 = await prisma.checkout.create({ data: { id: 'chk_a16', merchantId: merchantA.id, customerId: custA9.id,  amount: 349900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"TN-WEBCAM-4K","name":"Webcam 4K Ultra HD","qty":1,"price":349900}]', createdAt: T.d19, updatedAt: T.d19 } })
  const chkA17 = await prisma.checkout.create({ data: { id: 'chk_a17', merchantId: merchantA.id, customerId: custA14.id, amount: 179900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"TN-SSD-256","name":"Portable SSD 256GB","qty":1,"price":179900}]', abandonedAt: T.d22, createdAt: T.d21, updatedAt: T.d22 } })

  // Additional FitLife checkouts (chkB5–chkB9)
  const chkB5  = await prisma.checkout.create({ data: { id: 'chk_b5',  merchantId: merchantB.id, customerId: custB5.id,  amount: 149900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"FL-PLAN-ANNUAL","name":"Annual Plan","qty":1,"price":149900}]', createdAt: T.d7, updatedAt: T.d7 } })
  const chkB6  = await prisma.checkout.create({ data: { id: 'chk_b6',  merchantId: merchantB.id, customerId: custB6.id,  amount: 49900,  currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"FL-PLAN-MONTHLY","name":"Monthly Plan","qty":1,"price":49900}]', abandonedAt: T.d9, createdAt: T.d8, updatedAt: T.d9 } })
  const chkB7  = await prisma.checkout.create({ data: { id: 'chk_b7',  merchantId: merchantB.id, customerId: custB7.id,  amount: 129900, currency: 'INR', status: 'completed', itemsJson: '[{"sku":"FL-PLAN-QUARTERLY","name":"Quarterly Plan","qty":1,"price":129900}]', createdAt: T.d9, updatedAt: T.d9 } })
  const chkB8  = await prisma.checkout.create({ data: { id: 'chk_b8',  merchantId: merchantB.id, customerId: custB8.id,  amount: 49900,  currency: 'INR', status: 'expired', itemsJson: '[{"sku":"FL-PLAN-MONTHLY","name":"Monthly Plan","qty":1,"price":49900}]', createdAt: T.d10, updatedAt: T.d13 } })
  const chkB9  = await prisma.checkout.create({ data: { id: 'chk_b9',  merchantId: merchantB.id, customerId: custB10.id, amount: 149900, currency: 'INR', status: 'abandoned', itemsJson: '[{"sku":"FL-PLAN-ANNUAL","name":"Annual Plan","qty":1,"price":149900}]', abandonedAt: T.d13, createdAt: T.d12, updatedAt: T.d13 } })

  console.log(`  Checkouts: 25 created (17 TechNova, 8 FitLife)`)

  // ----------------------------------------------------------------
  // 6. SUBSCRIPTIONS (7)
  // ----------------------------------------------------------------
  console.log('\nSeeding Subscriptions...')

  // Merchant A — 4 subscriptions
  const subA1 = await prisma.subscription.create({
    data: { id: 'sub_a1', merchantId: merchantA.id, customerId: custA1.id, externalId: 'sub_ext_tn_001', amount: 99900, currency: 'INR', status: 'active', retryCount: 0, currentPeriodStart: T.d10, currentPeriodEnd: new Date('2025-04-10T00:00:00.000Z'), createdAt: T.d10, updatedAt: T.d10 },
  })
  const subA2 = await prisma.subscription.create({
    data: { id: 'sub_a2', merchantId: merchantA.id, customerId: custA3.id, externalId: 'sub_ext_tn_002', amount: 199900, currency: 'INR', status: 'past_due', retryCount: 3, currentPeriodStart: T.d8, currentPeriodEnd: T.d14, createdAt: T.d2, updatedAt: T.d12 },
  })
  const subA3 = await prisma.subscription.create({
    data: { id: 'sub_a3', merchantId: merchantA.id, customerId: custA5.id, externalId: 'sub_ext_tn_003', amount: 99900, currency: 'INR', status: 'cancelled', retryCount: 1, currentPeriodStart: T.d5, currentPeriodEnd: T.d11, createdAt: T.d5, updatedAt: T.d11 },
  })
  const subA4 = await prisma.subscription.create({
    data: { id: 'sub_a4', merchantId: merchantA.id, customerId: custA6.id, externalId: 'sub_ext_tn_004', amount: 49900, currency: 'INR', status: 'paused', retryCount: 0, currentPeriodStart: T.d7, currentPeriodEnd: T.d13, createdAt: T.d7, updatedAt: T.d12 },
  })

  // Merchant B — 3 subscriptions
  const subB1 = await prisma.subscription.create({
    data: { id: 'sub_b1', merchantId: merchantB.id, customerId: custB1.id, externalId: 'sub_ext_fl_001', amount: 149900, currency: 'INR', status: 'active', retryCount: 0, currentPeriodStart: T.d10, currentPeriodEnd: new Date('2026-01-12T00:00:00.000Z'), createdAt: T.d2, updatedAt: T.d10 },
  })
  const subB2 = await prisma.subscription.create({
    data: { id: 'sub_b2', merchantId: merchantB.id, customerId: custB2.id, externalId: 'sub_ext_fl_002', amount: 49900, currency: 'INR', status: 'past_due', retryCount: 2, currentPeriodStart: T.d7, currentPeriodEnd: T.d13, createdAt: T.d4, updatedAt: T.d11 },
  })
  const subB3 = await prisma.subscription.create({
    data: { id: 'sub_b3', merchantId: merchantB.id, customerId: custB4.id, externalId: 'sub_ext_fl_003', amount: 49900, currency: 'INR', status: 'active', retryCount: 1, currentPeriodStart: T.d12, currentPeriodEnd: new Date('2025-04-12T00:00:00.000Z'), createdAt: T.d12, updatedAt: T.d12 },
  })

  console.log(`  Subscriptions: 7 created (4 TechNova, 3 FitLife)`)

  // ----------------------------------------------------------------
  // 7. RECOVERY CASES (12)
  // ----------------------------------------------------------------
  console.log('\nSeeding Recovery Cases...')

  // Case 1: Payment failed — Priya, card declined, ₹1,299 — MEDIUM priority
  const case1 = await prisma.recoveryCase.create({
    data: { id: 'rc_001', merchantId: merchantA.id, paymentId: payA2.id, amountAtRisk: 129900, currency: 'INR', category: 'payment_failed', priority: 'medium', status: 'completed', recoveryProbability: 0.82, recoveredAmount: 129900, detectedAt: T.d3, resolvedAt: T.d5, createdAt: T.d3, updatedAt: T.d5 },
  })

  // Case 2: Payment failed — Ananya, UPI timed out, ₹2,199 — MEDIUM priority
  const case2 = await prisma.recoveryCase.create({
    data: { id: 'rc_002', merchantId: merchantA.id, paymentId: payA4.id, amountAtRisk: 219900, currency: 'INR', category: 'payment_failed', priority: 'medium', status: 'completed', recoveryProbability: 0.65, recoveredAmount: 219900, detectedAt: T.d4, resolvedAt: T.d7, createdAt: T.d4, updatedAt: T.d7 },
  })

  // Case 3: Checkout abandoned — Priya, ₹3,349 — HIGH priority (high-value cart)
  const case3 = await prisma.recoveryCase.create({
    data: { id: 'rc_003', merchantId: merchantA.id, checkoutId: chkA2.id, amountAtRisk: 334900, currency: 'INR', category: 'checkout_abandoned', priority: 'high', status: 'completed', recoveryProbability: 0.71, recoveredAmount: 334900, detectedAt: T.d5, resolvedAt: T.d7, createdAt: T.d5, updatedAt: T.d7 },
  })

  // Case 4: Checkout abandoned — Ananya, ₹2,199 — MEDIUM priority
  const case4 = await prisma.recoveryCase.create({
    data: { id: 'rc_004', merchantId: merchantA.id, checkoutId: chkA3.id, amountAtRisk: 219900, currency: 'INR', category: 'checkout_abandoned', priority: 'medium', status: 'awaiting_approval', recoveryProbability: 0.55, detectedAt: T.d6, createdAt: T.d6, updatedAt: T.d9 },
  })

  // Case 5: Payment failed — Arjun, high-value monitor ₹15,999 — CRITICAL
  const case5 = await prisma.recoveryCase.create({
    data: { id: 'rc_005', merchantId: merchantA.id, paymentId: payA7.id, amountAtRisk: 1599900, currency: 'INR', category: 'payment_failed', priority: 'critical', status: 'executing', recoveryProbability: 0.72, detectedAt: T.d7, createdAt: T.d7, updatedAt: T.d13 },
  })

  // Case 6: Checkout expired — Rahul, ₹4,598 — LOW priority
  const case6 = await prisma.recoveryCase.create({
    data: { id: 'rc_006', merchantId: merchantA.id, checkoutId: chkA5.id, amountAtRisk: 459800, currency: 'INR', category: 'checkout_abandoned', priority: 'low', status: 'dismissed', recoveryProbability: 0.18, detectedAt: T.d10, createdAt: T.d10, updatedAt: T.d12 },
  })

  // Case 7: Subscription lapsed — Vikram, ₹1,999/mo — HIGH priority
  const case7 = await prisma.recoveryCase.create({
    data: { id: 'rc_007', merchantId: merchantA.id, subscriptionId: subA2.id, amountAtRisk: 199900, currency: 'INR', category: 'subscription_lapsed', priority: 'high', status: 'diagnosed', recoveryProbability: 0.78, detectedAt: T.d12, createdAt: T.d12, updatedAt: T.d13 },
  })

  // Case 8: Checkout abandoned — Sneha, ₹1,599 — MEDIUM priority
  const case8 = await prisma.recoveryCase.create({
    data: { id: 'rc_008', merchantId: merchantA.id, checkoutId: chkA6.id, amountAtRisk: 159900, currency: 'INR', category: 'checkout_abandoned', priority: 'medium', status: 'detected', recoveryProbability: 0.0, detectedAt: T.d12, createdAt: T.d12, updatedAt: T.d12 },
  })

  // Case 9: Payment failed — Priya, headphones ₹6,999 — HIGH priority
  const case9 = await prisma.recoveryCase.create({
    data: { id: 'rc_009', merchantId: merchantA.id, paymentId: payA9.id, amountAtRisk: 699900, currency: 'INR', category: 'payment_failed', priority: 'high', status: 'executing', recoveryProbability: 0.68, detectedAt: T.d9, createdAt: T.d9, updatedAt: T.d14 },
  })

  // Case 10: Payment failed — Meera, monthly plan ₹499 — MEDIUM (FitLife)
  const case10 = await prisma.recoveryCase.create({
    data: { id: 'rc_010', merchantId: merchantB.id, paymentId: payB2.id, amountAtRisk: 49900, currency: 'INR', category: 'payment_failed', priority: 'medium', status: 'completed', recoveryProbability: 0.88, recoveredAmount: 49900, detectedAt: T.d5, resolvedAt: T.d6, createdAt: T.d5, updatedAt: T.d6 },
  })

  // Case 11: Subscription lapsed — Meera, ₹499/mo — MEDIUM (FitLife)
  const case11 = await prisma.recoveryCase.create({
    data: { id: 'rc_011', merchantId: merchantB.id, subscriptionId: subB2.id, amountAtRisk: 49900, currency: 'INR', category: 'subscription_lapsed', priority: 'medium', status: 'awaiting_approval', recoveryProbability: 0.62, detectedAt: T.d12, createdAt: T.d12, updatedAt: T.d14 },
  })

  // Case 12: Payment failed — Aryan, card expired ₹499 — LOW (FitLife)
  const case12 = await prisma.recoveryCase.create({
    data: { id: 'rc_012', merchantId: merchantB.id, paymentId: payB12.id, amountAtRisk: 49900, currency: 'INR', category: 'payment_failed', priority: 'low', status: 'diagnosed', recoveryProbability: 0.45, detectedAt: T.d12, createdAt: T.d12, updatedAt: T.d13 },
  })

  // Case 13: Checkout abandoned — Nisha, ₹5,999 keyboard — MEDIUM
  const case13 = await prisma.recoveryCase.create({
    data: { id: 'rc_013', merchantId: merchantA.id, checkoutId: chkA8.id, amountAtRisk: 599900, currency: 'INR', category: 'checkout_abandoned', priority: 'medium', status: 'completed', recoveryProbability: 0.70, recoveredAmount: 599900, detectedAt: T.d9, resolvedAt: T.d16, createdAt: T.d9, updatedAt: T.d16 },
  })

  // Case 14: Payment failed — Amit, ₹12,999 monitor — HIGH
  const case14 = await prisma.recoveryCase.create({
    data: { id: 'rc_014', merchantId: merchantA.id, paymentId: payA17.id, amountAtRisk: 1299900, currency: 'INR', category: 'payment_failed', priority: 'high', status: 'completed', recoveryProbability: 0.75, recoveredAmount: 1299900, detectedAt: T.d11, resolvedAt: T.d18, createdAt: T.d11, updatedAt: T.d18 },
  })

  // Case 15: Checkout abandoned — Tanya, ₹179 SSD — LOW
  const case15 = await prisma.recoveryCase.create({
    data: { id: 'rc_015', merchantId: merchantA.id, checkoutId: chkA17.id, amountAtRisk: 179900, currency: 'INR', category: 'checkout_abandoned', priority: 'low', status: 'failed', recoveryProbability: 0.30, detectedAt: T.d23, createdAt: T.d23, updatedAt: T.d24 },
  })

  // Case 16: Payment failed — Demo case for golden flow — HIGH priority
  const pay_demo = await prisma.payment.create({
    data: { id: 'pay_demo_001', merchantId: merchantB.id, customerId: custB1.id, externalId: 'pay_ext_demo_001', amount: 349900, currency: 'INR', status: 'failed', method: 'card', failureCode: 'BAD_REQUEST', failureReason: 'Card declined by issuer — temporary insufficient funds', description: 'Wireless Mechanical Keyboard', createdAt: T.d24, updatedAt: T.d24 },
  })
  const case16 = await prisma.recoveryCase.create({
    data: { id: 'rc_016', merchantId: merchantB.id, paymentId: pay_demo.id, amountAtRisk: 349900, currency: 'INR', category: 'payment_failed', priority: 'high', status: 'detected', recoveryProbability: 0.78, detectedAt: T.d24, createdAt: T.d24, updatedAt: T.d24 },
  })

  console.log(`  Recovery Cases: 16 created (12 TechNova, 4 FitLife)`)

  // ----------------------------------------------------------------
  // 8. AGENT DECISIONS (14)
  // ----------------------------------------------------------------
  console.log('\nSeeding Agent Decisions...')

  // Case 1 decisions (completed — approved, succeeded)
  await prisma.agentDecision.create({
    data: { id: 'dec_001', recoveryCaseId: case1.id, observation: 'Payment failed with BAD_REQUEST. Customer card was declined by issuer. Customer has 1 prior successful UPI payment suggesting willingness to pay.', diagnosis: 'Temporary insufficient funds on card. Customer has alternative payment methods available.', reasoningJson: '{"customer_history":{"total_payments":3,"successful_payments":1,"failed_payments":2},"failure_pattern":"first_card_failure","alternative_methods":["upi"]}', recommendedAction: 'retry_payment', confidence: 0.85, recoveryProbability: 0.82, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d4, createdAt: T.d3, updatedAt: T.d4 },
  })

  // Case 2 decisions (completed — approved, succeeded)
  await prisma.agentDecision.create({
    data: { id: 'dec_002', recoveryCaseId: case2.id, observation: 'UPI payment timed out after 120 seconds. Customer did not authenticate. Same customer has a completed checkout for ₹7,499 showing high purchase intent.', diagnosis: 'Customer was likely distracted or UPI app was slow. High intent signal from prior completed checkout.', reasoningJson: '{"customer_history":{"total_payments":2,"abandoned_checkouts":1},"timeout_reason":"no_authentication","intent_score":0.9}', recommendedAction: 'send_reminder', confidence: 0.72, recoveryProbability: 0.65, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d5, createdAt: T.d4, updatedAt: T.d5 },
  })

  // Case 3 decisions (completed — approved, succeeded)
  await prisma.agentDecision.create({
    data: { id: 'dec_003', recoveryCaseId: case3.id, observation: 'Cart abandoned with 2 items totaling ₹3,349. Customer had a prior failed card payment suggesting payment friction. Cart includes complementary products (mouse + mousepad).', diagnosis: 'Payment friction caused abandonment. Cross-sell bundle presents good recovery opportunity with a small incentive.', reasoningJson: '{"cart_value":334900,"item_count":2,"days_since_abandonment":2,"customer_segment":"returning","suggested_discount_pct":5}', recommendedAction: 'offer_discount', confidence: 0.78, recoveryProbability: 0.71, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d6, createdAt: T.d5, updatedAt: T.d6 },
  })

  // Case 4 decisions (awaiting_approval)
  await prisma.agentDecision.create({
    data: { id: 'dec_004', recoveryCaseId: case4.id, observation: 'Cart abandoned with USB-C Hub ₹2,199. Customer had a UPI timeout failure on this same product 1 day before. The product was re-added to cart.', diagnosis: 'Customer wants this product but keeps hitting payment issues. UPI timeout is frustrating the customer — switching payment method recommended.', reasoningJson: '{"cart_value":219900,"previous_failure":"TIMED_OUT","same_product_retry":true,"days_since_abandonment":2}', recommendedAction: 'update_payment_method', confidence: 0.60, recoveryProbability: 0.55, status: 'pending', createdAt: T.d6, updatedAt: T.d6 },
  })

  // Case 5 decisions (executing — critical, escalated)
  await prisma.agentDecision.create({
    data: { id: 'dec_005', recoveryCaseId: case5.id, observation: 'HIGH-VALUE payment failure ₹15,999 for 4K Monitor. Bank gateway error — not customer fault. Customer has 1 prior successful payment (₹2,499 UPI). This is the highest single-transaction failure this month.', diagnosis: 'Transient bank-side gateway error. Customer has demonstrated purchase intent. Priority recovery recommended via alternative payment method.', reasoningJson: '{"cart_value":1599900,"failure_code":"PAYMENT_ERROR","bank_side":true,"customer_lifetime_value":1849800,"days_since_failure":1,"priority_override":"critical"}', recommendedAction: 'retry_payment', confidence: 0.88, recoveryProbability: 0.72, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d8, createdAt: T.d7, updatedAt: T.d8 },
  })

  // Case 6 decisions (dismissed — low probability)
  await prisma.agentDecision.create({
    data: { id: 'dec_006', recoveryCaseId: case6.id, observation: 'Checkout expired after 2 days. Cart contained keyboard and cables. Customer had a refund of ₹8,999 last month — possible buyer remorse.', diagnosis: 'Low recovery probability. Customer recently received a large refund and may be hesitant. Expired checkout is over 30 days old relative to cart value.', reasoningJson: '{"cart_value":459800,"days_since_expiry":3,"recent_refund":899900,"refund_to_cart_ratio":1.95,"intent_score":0.2}', recommendedAction: 'no_action', confidence: 0.70, recoveryProbability: 0.18, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d11, createdAt: T.d10, updatedAt: T.d11 },
  })

  // Case 7 decisions (diagnosed — subscription lapsed)
  await prisma.agentDecision.create({
    data: { id: 'dec_007', recoveryCaseId: case7.id, observation: 'Subscription past_due with 3 failed retries. ₹1,999/mo plan. Customer has 2 successful prior payments totaling ₹7,098.', diagnosis: 'Payment method likely expired or changed. 3 retries indicates system retry exhaustion. Customer engagement was good before the lapse.', reasoningJson: '{"subscription_amount":199900,"retry_count":3,"customer_tenure_months":3,"prior_successful_payments":2,"engagement_score":0.75}', recommendedAction: 'update_payment_method', confidence: 0.80, recoveryProbability: 0.78, status: 'pending', createdAt: T.d12, updatedAt: T.d12 },
  })

  // Case 8 decisions (just detected — no decision yet, system-created)
  await prisma.agentDecision.create({
    data: { id: 'dec_008', recoveryCaseId: case8.id, observation: 'Fresh cart abandonment detected for ₹1,599 laptop stand. Customer has 1 successful wallet payment previously.', diagnosis: 'Investigating. Case just detected — need to analyze customer behavior patterns and payment history.', reasoningJson: '{"cart_value":159900,"fresh_case":true,"analysis_pending":true}', recommendedAction: 'send_reminder', confidence: 0.40, recoveryProbability: 0.0, status: 'pending', createdAt: T.d12, updatedAt: T.d12 },
  })

  // Case 9 decisions (executing — retry with different method)
  await prisma.agentDecision.create({
    data: { id: 'dec_009', recoveryCaseId: case9.id, observation: 'Payment failed with INVALID_VPA — invalid UPI handle. ₹6,999 headphones. Customer has a prior successful captured payment for ₹1,299 laptop stand on same day via card.', diagnosis: 'Customer entered wrong UPI ID. Card payment works fine. Retry with card or send reminder to fix UPI handle.', reasoningJson: '{"cart_value":699900,"failure_code":"INVALID_VPA","customer_has_working_card":true,"same_day_success":true}', recommendedAction: 'send_reminder', confidence: 0.82, recoveryProbability: 0.68, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d10, createdAt: T.d9, updatedAt: T.d10 },
  })

  // Case 10 decisions (completed — FitLife, approved, succeeded)
  await prisma.agentDecision.create({
    data: { id: 'dec_010', recoveryCaseId: case10.id, observation: 'Monthly plan payment ₹499 failed via UPI timeout. Customer is new — first payment attempt. No prior history.', diagnosis: 'New customer with UPI friction. First impression critical — send gentle reminder with UPI payment link.', reasoningJson: '{"plan_value":49900,"customer_status":"new","failure_code":"TIMED_OUT","retention_importance":"high"}', recommendedAction: 'send_reminder', confidence: 0.90, recoveryProbability: 0.88, status: 'approved', reviewedBy: 'merchant_fit_life', reviewedAt: T.d5, createdAt: T.d5, updatedAt: T.d5 },
  })

  // Case 11 decisions (awaiting_approval — FitLife subscription)
  await prisma.agentDecision.create({
    data: { id: 'dec_011', recoveryCaseId: case11.id, observation: 'Subscription past_due with 2 failed retries for ₹499/mo. Customer had a prior UPI timeout on the same plan. Successfully completed checkout for annual plan ₹1,499 in Feb.', diagnosis: 'Customer upgraded to annual but monthly auto-debit keeps failing. UPI mandate may be misconfigured. Recommend updating payment method to card.', reasoningJson: '{"subscription_amount":49900,"retry_count":2,"customer_upgraded":true,"annual_plan_active":true,"upi_mandate_likely_broken":true}', recommendedAction: 'update_payment_method', confidence: 0.75, recoveryProbability: 0.62, status: 'pending', createdAt: T.d12, updatedAt: T.d12 },
  })

  // Case 12 decisions (diagnosed — FitLife, card expired)
  await prisma.agentDecision.create({
    data: { id: 'dec_012', recoveryCaseId: case12.id, observation: 'Monthly renewal ₹499 failed — card expired Jan 2025. Customer has active subscription and a successful quarterly plan payment ₹1,299 via UPI.', diagnosis: 'Expired card is the root cause. Customer already uses UPI successfully. Simple payment method update will resolve.', reasoningJson: '{"card_expiry":"2025-01","alternative_upi_active":true,"upi_payment_amount":129900,"resolution_complexity":"low"}', recommendedAction: 'update_payment_method', confidence: 0.92, recoveryProbability: 0.45, status: 'pending', createdAt: T.d12, updatedAt: T.d12 },
  })

  // Extra: second decision on case 5 (escalation after first retry failed)
  await prisma.agentDecision.create({
    data: { id: 'dec_013', recoveryCaseId: case5.id, observation: 'First recovery attempt via retry_payment failed — same gateway error persisted. Customer has been waiting 6 days for this ₹15,999 monitor.', diagnosis: 'Bank gateway issue is ongoing. Retry is not sufficient — need to escalate to merchant for manual intervention or offer alternative checkout flow.', reasoningJson: '{"attempted_action":"retry_payment","attempt_result":"failed","days_waiting":6,"amount_at_risk":1599900,"escalation_justified":true}', recommendedAction: 'escalate_to_merchant', confidence: 0.95, recoveryProbability: 0.60, status: 'pending', createdAt: T.d13, updatedAt: T.d13 },
  })

  // Extra: overridden decision on case 6 (merchant chose to send reminder despite AI saying no_action)
  await prisma.agentDecision.create({
    data: { id: 'dec_014', recoveryCaseId: case6.id, observation: 'Merchant override: Despite AI recommendation of no_action, merchant wants to send a reminder for the expired ₹4,598 checkout.', diagnosis: 'Merchant believes customer may still be interested in keyboard and cables bundle. Merchant cites positive prior interaction.', reasoningJson: '{"original_recommendation":"no_action","original_confidence":0.70,"merchant_override":true,"override_reason":"merchant_relationship"}', recommendedAction: 'send_reminder', confidence: 0.35, recoveryProbability: 0.18, status: 'overridden', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d12, createdAt: T.d12, updatedAt: T.d12 },
  })

  // Case 12 updated: Aryan card declined — update_payment_method
 await prisma.agentDecision.create({
 data: { id: 'dec_018', recoveryCaseId: case12.id, observation: 'Monthly plan ₹499 failed — card declined by issuer. Customer has active quarterly subscription paid via UPI.', diagnosis: 'Card declined, likely insufficient balance or block. Customer already uses UPI successfully for quarterly plan.', reasoningJson: '{"card_declined":true,"upi_alternative_available":true,"upi_payment_history":true}', recommendedAction: 'update_payment_method', confidence: 0.88, recoveryProbability: 0.45, status: 'pending', createdAt: T.d12, updatedAt: T.d12 },
 })

 // Case 13: Nisha keyboard abandonment — approved, succeeded
 await prisma.agentDecision.create({
 data: { id: 'dec_015', recoveryCaseId: case13.id, observation: 'Cart abandoned with ₹5,999 Mechanical Keyboard RGB. Customer had previously failed card payment for the same item.', diagnosis: 'Payment friction from repeated card declines. Sustained interest shown by re-adding item. Discount incentive should convert.', reasoningJson: '{"cart_value":599900,"same_product_reattempt":true,"days_since_abandonment":1}', recommendedAction: 'offer_discount', confidence: 0.74, recoveryProbability: 0.70, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d10, createdAt: T.d9, updatedAt: T.d10 },
 })

 // Case 14: Amit monitor failure — approved, succeeded via retry
 await prisma.agentDecision.create({
 data: { id: 'dec_016', recoveryCaseId: case14.id, observation: 'High-value ₹12,999 monitor payment failed with UPI timeout. First-time customer.', diagnosis: 'First-time customer likely confused by UPI payment flow. Direct retry with clear instructions should work.', reasoningJson: '{"cart_value":1299900,"customer_status":"new","failure_code":"TIMED_OUT","high_value":true}', recommendedAction: 'retry_payment', confidence: 0.80, recoveryProbability: 0.75, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d12, createdAt: T.d11, updatedAt: T.d12 },
 })

 // Case 15: Tanya SSD abandonment — approved, but failed
 await prisma.agentDecision.create({
 data: { id: 'dec_017', recoveryCaseId: case15.id, observation: 'Low-value ₹1,799 SSD abandoned. Customer has 1 prior successful purchase.', diagnosis: 'Low-value item with low recovery probability. Customer may have found a better deal elsewhere.', reasoningJson: '{"cart_value":179900,"customer_prior_purchases":1,"competitor_pressure":true}', recommendedAction: 'send_reminder', confidence: 0.55, recoveryProbability: 0.30, status: 'approved', reviewedBy: 'merchant_tech_nova', reviewedAt: T.d24, createdAt: T.d23, updatedAt: T.d24 },
 })

   // Decision 19: Demo golden flow — pending retry_payment for case16
  await prisma.agentDecision.create({
    data: {
      id: 'dec_019', recoveryCaseId: case16.id,
      observation: 'Card payment declined with BAD_REQUEST at \u20b93,499 for Wireless Mechanical Keyboard. Customer has 1 prior successful UPI payment (\u20b92,499 laptop stand). Card decline suggests temporary insufficient funds.',
      diagnosis: 'Temporary card decline. Customer has demonstrated payment capability via prior UPI success. Retry with same card may succeed if funds are now available.',
      reasoningJson: JSON.stringify({ promptVersion: 'v1', aiOutput: { action: 'retry_payment', confidence: 0.82, reason: 'Card declined, high recovery probability', factors: ['Card decline suggests temporary insufficient funds', 'Customer has prior successful UPI payment', 'Mid-range purchase with demonstrated intent'], riskLevel: 'MEDIUM', customerIntent: 'HIGH' }, policyResult: { allowed: true, finalAction: 'retry_payment', rejectionReason: null, policyViolations: [] }, usedFallback: true }),
      recommendedAction: 'retry_payment',
      confidence: 0.82,
      recoveryProbability: 0.78,
      status: 'pending',
      createdAt: T.d24,
      updatedAt: T.d24,
    },
  })

  // Update case16 to awaiting_approval for the demo
  await prisma.recoveryCase.update({
    where: { id: 'rc_016' },
    data: { status: 'awaiting_approval' },
  })

  console.log(`  Agent Decisions: 19 created`)

  // ----------------------------------------------------------------
  // 9. RECOVERY ATTEMPTS (20+)
  // ----------------------------------------------------------------
  console.log('\nSeeding Recovery Attempts...')

  // Case 13: offer_discount → succeeded (Nisha keyboard)
  await prisma.recoveryAttempt.create({
    data: { id: 'att_017', recoveryCaseId: case13.id, action: 'offer_discount', status: 'succeeded', recoveredAmount: 599900, failureReason: '', externalRef: 'discount_code_KB10OFF', attemptedAt: T.d11, completedAt: T.d16, createdAt: T.d11, updatedAt: T.d16 },
  })

  // Case 14: retry_payment → succeeded (Amit monitor)
  await prisma.recoveryAttempt.create({
    data: { id: 'att_018', recoveryCaseId: case14.id, action: 'retry_payment', status: 'succeeded', recoveredAmount: 1299900, failureReason: '', externalRef: 'pay_ext_tn_retry_017', attemptedAt: T.d13, completedAt: T.d18, createdAt: T.d13, updatedAt: T.d18 },
  })

  // Case 15: send_reminder → failed (Tanya SSD)
  await prisma.recoveryAttempt.create({
    data: { id: 'att_019', recoveryCaseId: case15.id, action: 'send_reminder', status: 'failed', recoveredAmount: 0, failureReason: 'Reminder sent but customer did not respond within 48 hours', externalRef: 'email_reminder_015', attemptedAt: T.d24, completedAt: T.d25, createdAt: T.d24, updatedAt: T.d25 },
  })

  // Case 13: initial send_reminder before discount
  await prisma.recoveryAttempt.create({
    data: { id: 'att_020', recoveryCaseId: case13.id, action: 'send_reminder', status: 'failed', recoveredAmount: 0, failureReason: 'Reminder sent but no conversion after 24 hours', externalRef: 'email_reminder_013a', attemptedAt: T.d10, completedAt: T.d11, createdAt: T.d10, updatedAt: T.d11 },
  })

  // Case 14: initial retry that also failed
  await prisma.recoveryAttempt.create({
    data: { id: 'att_021', recoveryCaseId: case14.id, action: 'retry_payment', status: 'failed', recoveredAmount: 0, failureReason: 'UPI timed out again on first retry attempt', externalRef: 'pay_ext_tn_retry_017a', attemptedAt: T.d12, completedAt: T.d12, createdAt: T.d12, updatedAt: T.d12 },
  })


  // Case 2: send_reminder → succeeded
  await prisma.recoveryAttempt.create({
    data: { id: 'att_002', recoveryCaseId: case2.id, action: 'send_reminder', status: 'succeeded', recoveredAmount: 219900, failureReason: '', externalRef: 'email_reminder_001', attemptedAt: T.d5, completedAt: T.d7, createdAt: T.d5, updatedAt: T.d7 },
  })

  // Case 3: offer_discount (5% off) → succeeded
  await prisma.recoveryAttempt.create({
    data: { id: 'att_003', recoveryCaseId: case3.id, action: 'offer_discount', status: 'succeeded', recoveredAmount: 334900, failureReason: '', externalRef: 'discount_code_D5OFF_001', attemptedAt: T.d6, completedAt: T.d7, createdAt: T.d6, updatedAt: T.d7 },
  })

  // Case 4: update_payment_method → in_progress (awaiting approval)
  await prisma.recoveryAttempt.create({
    data: { id: 'att_004', recoveryCaseId: case4.id, action: 'update_payment_method', status: 'running', recoveredAmount: 0, failureReason: '', externalRef: '', attemptedAt: T.d9, createdAt: T.d9, updatedAt: T.d9 },
  })

  // Case 5: first retry_payment → failed
  await prisma.recoveryAttempt.create({
    data: { id: 'att_005', recoveryCaseId: case5.id, action: 'retry_payment', status: 'failed', recoveredAmount: 0, failureReason: 'Bank gateway still returning PAYMENT_ERROR — persistent infrastructure issue', externalRef: 'pay_ext_tn_retry_005', attemptedAt: T.d9, completedAt: T.d9, createdAt: T.d9, updatedAt: T.d9 },
  })

  // Case 5: second attempt send_reminder → in_progress
  await prisma.recoveryAttempt.create({
    data: { id: 'att_006', recoveryCaseId: case5.id, action: 'send_reminder', status: 'running', recoveredAmount: 0, failureReason: '', externalRef: 'email_reminder_005', attemptedAt: T.d13, createdAt: T.d13, updatedAt: T.d13 },
  })

  // Case 6: no_action → skipped
  await prisma.recoveryAttempt.create({
    data: { id: 'att_007', recoveryCaseId: case6.id, action: 'no_action', status: 'cancelled', recoveredAmount: 0, failureReason: '', externalRef: '', attemptedAt: T.d11, completedAt: T.d11, createdAt: T.d11, updatedAt: T.d11 },
  })

  // Case 9: send_reminder → in_progress
  await prisma.recoveryAttempt.create({
    data: { id: 'att_008', recoveryCaseId: case9.id, action: 'send_reminder', status: 'running', recoveredAmount: 0, failureReason: '', externalRef: 'email_reminder_009', attemptedAt: T.d11, createdAt: T.d11, updatedAt: T.d11 },
  })

  // Case 10: send_reminder → succeeded (FitLife)
  await prisma.recoveryAttempt.create({
    data: { id: 'att_009', recoveryCaseId: case10.id, action: 'send_reminder', status: 'succeeded', recoveredAmount: 49900, failureReason: '', externalRef: 'email_reminder_fl_001', attemptedAt: T.d5, completedAt: T.d6, createdAt: T.d5, updatedAt: T.d6 },
  })

  // Case 1: initial failed retry before success (shows retry history)
  await prisma.recoveryAttempt.create({
    data: { id: 'att_010', recoveryCaseId: case1.id, action: 'retry_payment', status: 'failed', recoveredAmount: 0, failureReason: 'Same card declined again — insufficient funds persist', externalRef: 'pay_ext_tn_retry_000', attemptedAt: T.d3, completedAt: T.d3, createdAt: T.d3, updatedAt: T.d3 },
  })

  // Case 3: initial reminder before discount offer
  await prisma.recoveryAttempt.create({
    data: { id: 'att_011', recoveryCaseId: case3.id, action: 'send_reminder', status: 'failed', recoveredAmount: 0, failureReason: 'Reminder sent but customer did not convert within 24 hours', externalRef: 'email_reminder_003a', attemptedAt: T.d5, completedAt: T.d6, createdAt: T.d5, updatedAt: T.d6 },
  })

  // Case 6: overridden — send_reminder → failed
  await prisma.recoveryAttempt.create({
    data: { id: 'att_012', recoveryCaseId: case6.id, action: 'send_reminder', status: 'failed', recoveredAmount: 0, failureReason: 'Reminder email bounced — customer email address no longer valid', externalRef: 'email_reminder_006', attemptedAt: T.d13, completedAt: T.d13, createdAt: T.d13, updatedAt: T.d13 },
  })

  // Case 2: initial retry attempt before reminder
  await prisma.recoveryAttempt.create({
    data: { id: 'att_013', recoveryCaseId: case2.id, action: 'retry_payment', status: 'failed', recoveredAmount: 0, failureReason: 'UPI timed out again — same timeout behavior', externalRef: 'pay_ext_tn_retry_002a', attemptedAt: T.d4, completedAt: T.d4, createdAt: T.d4, updatedAt: T.d4 },
  })

  // Case 10: initial retry before reminder succeeded
  await prisma.recoveryAttempt.create({
    data: { id: 'att_014', recoveryCaseId: case10.id, action: 'retry_payment', status: 'failed', recoveredAmount: 0, failureReason: 'UPI timed out again on retry', externalRef: 'pay_ext_fl_retry_002a', attemptedAt: T.d5, completedAt: T.d5, createdAt: T.d5, updatedAt: T.d5 },
  })

  // Case 5: cancel_and_refund attempt that was skipped
  await prisma.recoveryAttempt.create({
    data: { id: 'att_015', recoveryCaseId: case5.id, action: 'cancel_and_refund', status: 'cancelled', recoveredAmount: 0, failureReason: '', externalRef: '', attemptedAt: T.d10, completedAt: T.d10, createdAt: T.d10, updatedAt: T.d10 },
  })

  // Case 9: retry_payment → pending (queued after reminder)
  await prisma.recoveryAttempt.create({
    data: { id: 'att_016', recoveryCaseId: case9.id, action: 'retry_payment', status: 'pending', recoveredAmount: 0, failureReason: '', externalRef: '', attemptedAt: T.d14, createdAt: T.d14, updatedAt: T.d14 },
  })

  console.log(`  Recovery Attempts: 21 created`)

  // ----------------------------------------------------------------
  // 10. AUDIT EVENTS (20)
  // ----------------------------------------------------------------
  console.log('\nSeeding Audit Events...')

  // System-level events (no caseId)
  await prisma.auditEvent.create({
    data: { id: 'audit_001', caseId: null, actorType: 'system', actorId: 'system', eventType: 'seed_init', entityType: 'Merchant', entityId: merchantA.id, action: 'CREATE', details: 'Merchant TechNova Electronics created during database seed', metadataJson: '{"seed_version":"1.0.0"}', createdAt: T.d1 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_002', caseId: null, actorType: 'system', actorId: 'system', eventType: 'seed_init', entityType: 'Merchant', entityId: merchantB.id, action: 'CREATE', details: 'Merchant FitLife Subscriptions created during database seed', metadataJson: '{"seed_version":"1.0.0"}', createdAt: T.d1 },
  })

  // Case 1 audit trail
  await prisma.auditEvent.create({
    data: { id: 'audit_003', caseId: case1.id, actorType: 'webhook', actorId: 'razorpay_webhook', eventType: 'payment_failed', entityType: 'Payment', entityId: payA2.id, action: 'WEBHOOK_RECEIVED', details: 'Razorpay webhook: payment pay_ext_tn_002 failed with BAD_REQUEST', metadataJson: '{"webhook_id":"wh_001","event":"payment.failed","code":"BAD_REQUEST"}', createdAt: T.d3 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_004', caseId: case1.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'case_created', entityType: 'RecoveryCase', entityId: case1.id, action: 'CREATE', details: 'AI agent detected failed payment and created recovery case rc_001', metadataJson: '{"category":"payment_failed","initial_priority":"medium"}', createdAt: T.d3 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_005', caseId: case1.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'decision_created', entityType: 'AgentDecision', entityId: 'dec_001', action: 'CREATE', details: 'AI agent recommended retry_payment with 85% confidence', metadataJson: '{"recommended_action":"retry_payment","confidence":0.85}', createdAt: T.d3 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_006', caseId: case1.id, actorType: 'merchant', actorId: 'merchant_tech_nova', eventType: 'decision_approved', entityType: 'AgentDecision', entityId: 'dec_001', action: 'APPROVE', details: 'Merchant approved retry_payment recommendation', metadataJson: '{"reviewer":"merchant_tech_nova"}', createdAt: T.d4 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_007', caseId: case1.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'attempt_succeeded', entityType: 'RecoveryAttempt', entityId: 'att_001', action: 'RETRY_SUCCESS', details: 'Payment retry succeeded — recovered ₹1,299', metadataJson: '{"recovered_amount":129900,"external_ref":"pay_ext_tn_retry_001"}', createdAt: T.d5 },
  })

  // Case 5 audit trail (critical, escalation path)
  await prisma.auditEvent.create({
    data: { id: 'audit_008', caseId: case5.id, actorType: 'webhook', actorId: 'razorpay_webhook', eventType: 'payment_failed', entityType: 'Payment', entityId: payA7.id, action: 'WEBHOOK_RECEIVED', details: 'Razorpay webhook: payment pay_ext_tn_007 failed — ₹15,999 at risk', metadataJson: '{"webhook_id":"wh_007","event":"payment.failed","amount":1599900}', createdAt: T.d7 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_009', caseId: case5.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'case_created', entityType: 'RecoveryCase', entityId: case5.id, action: 'CREATE', details: 'AI agent created CRITICAL recovery case for ₹15,999 monitor payment failure', metadataJson: '{"category":"payment_failed","priority":"critical"}', createdAt: T.d7 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_010', caseId: case5.id, actorType: 'merchant', actorId: 'merchant_tech_nova', eventType: 'decision_approved', entityType: 'AgentDecision', entityId: 'dec_005', action: 'APPROVE', details: 'Merchant approved critical retry_payment for ₹15,999 monitor', metadataJson: '{"reviewer":"merchant_tech_nova","priority":"critical"}', createdAt: T.d8 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_011', caseId: case5.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'attempt_failed', entityType: 'RecoveryAttempt', entityId: 'att_005', action: 'RETRY_FAILED', details: 'Payment retry failed — bank gateway error persists', metadataJson: '{"failure_reason":"persistent_gateway_error"}', createdAt: T.d9 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_012', caseId: case5.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'escalation', entityType: 'RecoveryCase', entityId: case5.id, action: 'ESCALATE', details: 'AI agent escalated case to merchant after retry failure — recommending manual intervention', metadataJson: '{"escalation_reason":"retry_exhausted","attempts":1}', createdAt: T.d13 },
  })

  // Case 10 audit trail (FitLife, successful recovery)
  await prisma.auditEvent.create({
    data: { id: 'audit_013', caseId: case10.id, actorType: 'webhook', actorId: 'razorpay_webhook', eventType: 'payment_failed', entityType: 'Payment', entityId: payB2.id, action: 'WEBHOOK_RECEIVED', details: 'Razorpay webhook: FitLife monthly plan payment failed', metadataJson: '{"webhook_id":"wh_fl_002","event":"payment.failed"}', createdAt: T.d5 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_014', caseId: case10.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'case_resolved', entityType: 'RecoveryCase', entityId: case10.id, action: 'RESOLVE', details: 'Case resolved successfully — ₹499 recovered via reminder email', metadataJson: '{"recovered_amount":49900,"resolution_time_hours":24}', createdAt: T.d6 },
  })

  // Case 6 audit trail (dismissed, then overridden)
  await prisma.auditEvent.create({
    data: { id: 'audit_015', caseId: case6.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'case_dismissed', entityType: 'RecoveryCase', entityId: case6.id, action: 'DISMISS', details: 'AI agent dismissed expired checkout — low recovery probability (18%)', metadataJson: '{"recovery_probability":0.18,"reason":"low_intent"}', createdAt: T.d11 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_016', caseId: case6.id, actorType: 'merchant', actorId: 'merchant_tech_nova', eventType: 'decision_overridden', entityType: 'AgentDecision', entityId: 'dec_014', action: 'OVERRIDE', details: 'Merchant overrode no_action decision — wants reminder sent anyway', metadataJson: '{"original_action":"no_action","overridden_action":"send_reminder"}', createdAt: T.d12 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_017', caseId: case6.id, actorType: 'system', actorId: 'system', eventType: 'attempt_failed', entityType: 'RecoveryAttempt', entityId: 'att_012', action: 'EMAIL_BOUNCED', details: 'Reminder email bounced — customer email no longer valid', metadataJson: '{"bounce_type":"hard_bounce","email_status":"invalid"}', createdAt: T.d13 },
  })

  // System-level webhook processing event
  await prisma.auditEvent.create({
    data: { id: 'audit_018', caseId: null, actorType: 'webhook', actorId: 'razorpay_webhook', eventType: 'webhook_batch_processed', entityType: 'system', entityId: '', action: 'BATCH_PROCESS', details: 'Processed batch of 5 Razorpay webhooks — 3 payment.failed, 1 payment.captured, 1 subscription.charged', metadataJson: '{"batch_size":5,"processing_time_ms":342}', createdAt: T.d9 },
  })

  // AI agent heartbeat / system event
  await prisma.auditEvent.create({
    data: { id: 'audit_019', caseId: null, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'agent_cycle_completed', entityType: 'system', entityId: '', action: 'CYCLE_COMPLETE', details: 'Recovery agent completed analysis cycle — 12 active cases, 4 new decisions generated', metadataJson: '{"cases_analyzed":12,"decisions_generated":4,"cycle_duration_ms":2100}', createdAt: T.d13 },
  })

  // Case 3 discount success event
  await prisma.auditEvent.create({
    data: { id: 'audit_020', caseId: case3.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'discount_redeemed', entityType: 'RecoveryAttempt', entityId: 'att_003', action: 'DISCOUNT_CONVERTED', details: 'Customer redeemed 5% discount code D5OFF and completed purchase — ₹3,349 recovered', metadataJson: '{"discount_code":"D5OFF","discount_pct":5,"recovered_amount":334900,"time_to_convert_hours":24}', createdAt: T.d7 },
  })

  // Case 13/14 audit events
  await prisma.auditEvent.create({
    data: { id: 'audit_021', caseId: case13.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'case_resolved', entityType: 'RecoveryCase', entityId: case13.id, action: 'RESOLVE', details: 'Case resolved — ₹5,999 recovered via 10% discount on Mechanical Keyboard', metadataJson: '{"recovered_amount":599900,"discount_pct":10,"resolution_time_hours":168}', createdAt: T.d16 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_022', caseId: case14.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'attempt_succeeded', entityType: 'RecoveryAttempt', entityId: 'att_018', action: 'RETRY_SUCCESS', details: 'Payment retry succeeded on second attempt — ₹12,999 recovered', metadataJson: '{"recovered_amount":1299900,"attempts":2}', createdAt: T.d18 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_023', caseId: case15.id, actorType: 'system', actorId: 'system', eventType: 'case_failed', entityType: 'RecoveryCase', entityId: case15.id, action: 'FAIL', details: 'Recovery case marked failed — reminder sent but no response after 48 hours', metadataJson: '{"recovery_probability":0.30,"attempts":1,"failure_reason":"no_response"}', createdAt: T.d25 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_024', caseId: case12.id, actorType: 'ai_agent', actorId: 'recovery_agent_v1', eventType: 'decision_created', entityType: 'AgentDecision', entityId: 'dec_018', action: 'CREATE', details: 'AI agent recommended update_payment_method for expired card — FitLife customer', metadataJson: '{"recommended_action":"update_payment_method","confidence":0.88}', createdAt: T.d12 },
  })
  await prisma.auditEvent.create({
    data: { id: 'audit_025', caseId: null, actorType: 'webhook', actorId: 'razorpay_webhook', eventType: 'webhook_batch_processed', entityType: 'system', entityId: '', action: 'BATCH_PROCESS', details: 'Processed batch of 8 Razorpay webhooks — 5 payment.captured, 2 payment.failed, 1 subscription.charged', metadataJson: '{"batch_size":8,"processing_time_ms":287}', createdAt: T.d16 },
  })

  console.log(`  Audit Events: 25 created`)

  // ----------------------------------------------------------------
  // RECOVERY ATTRIBUTIONS
  // ----------------------------------------------------------------
  // Each attribution proves that recovered revenue came from a verified
  // successful payment event — not from action execution alone.

  // Recovery payments for cases that didn't have an obvious retry payment
  const payRecovery1 = await prisma.payment.create({ data: { id: 'pay_r_001', merchantId: merchantA.id, customerId: custA2.id, externalId: 'pay_ext_tn_r_001', amount: 129900, currency: 'INR', status: 'captured', method: 'upi', description: 'Ergonomic Laptop Stand — recovered via payment link', createdAt: T.d5, updatedAt: T.d5 } })
  const payRecovery2 = await prisma.payment.create({ data: { id: 'pay_r_002', merchantId: merchantA.id, customerId: custA4.id, externalId: 'pay_ext_tn_r_002', amount: 219900, currency: 'INR', status: 'captured', method: 'card', description: 'USB-C 7-in-1 Hub — recovered via reminder', createdAt: T.d7, updatedAt: T.d7 } })
  const payRecovery3 = await prisma.payment.create({ data: { id: 'pay_r_003', merchantId: merchantA.id, customerId: custA3.id, externalId: 'pay_ext_tn_r_003', amount: 334900, currency: 'INR', status: 'captured', method: 'upi', description: 'Portable SSD 1TB — recovered via discount link', createdAt: T.d7, updatedAt: T.d7 } })
  const payRecovery10 = await prisma.payment.create({ data: { id: 'pay_r_010', merchantId: merchantB.id, customerId: custB2.id, externalId: 'pay_ext_fl_r_010', amount: 49900, currency: 'INR', status: 'captured', method: 'upi', description: 'FitLife Monthly — recovered via reminder', createdAt: T.d6, updatedAt: T.d6 } })

  // Attribution records linking successful payments to recovery cases
  await prisma.recoveryAttribution.create({ data: { recoveryCaseId: case1.id, paymentId: payRecovery1.id, amount: 129900, status: 'attributed', source: 'payment_link', confidence: 0.85, reason: 'Customer paid via payment link after failed retry. Original retry failed but customer paid via new payment link.', createdAt: T.d5, updatedAt: T.d5 } })
  await prisma.recoveryAttribution.create({ data: { recoveryCaseId: case2.id, recoveryAttemptId: 'att_002', paymentId: payRecovery2.id, amount: 219900, status: 'attributed', source: 'payment_link', confidence: 0.85, reason: 'Customer paid after send_reminder action. New payment created and captured.', createdAt: T.d7, updatedAt: T.d7 } })
  await prisma.recoveryAttribution.create({ data: { recoveryCaseId: case3.id, recoveryAttemptId: 'att_003', paymentId: payRecovery3.id, amount: 334900, status: 'attributed', source: 'payment_link', confidence: 0.85, reason: 'Customer completed purchase after discount code from recovery action att_003.', createdAt: T.d7, updatedAt: T.d7 } })
  await prisma.recoveryAttribution.create({ data: { recoveryCaseId: case10.id, recoveryAttemptId: 'att_009', paymentId: payRecovery10.id, amount: 49900, status: 'attributed', source: 'payment_link', confidence: 0.85, reason: 'FitLife customer paid monthly plan after send_reminder action.', createdAt: T.d6, updatedAt: T.d6 } })
  await prisma.recoveryAttribution.create({ data: { recoveryCaseId: case13.id, recoveryAttemptId: 'att_017', paymentId: 'pay_a23', amount: 599900, status: 'attributed', source: 'payment_link', confidence: 0.85, reason: 'Customer returned after offer_discount action. New netbanking payment captured.', createdAt: T.d16, updatedAt: T.d16 } })
  await prisma.recoveryAttribution.create({ data: { recoveryCaseId: case14.id, recoveryAttemptId: 'att_018', paymentId: 'pay_a25', amount: 1299900, status: 'attributed', source: 'payment_link', confidence: 0.85, reason: 'Customer paid with card after retry_payment action succeeded. 4K Monitor recovered.', createdAt: T.d18, updatedAt: T.d18 } })

  // ----------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------
  console.log('\n========================================')
  console.log('  SEED COMPLETE — Summary')
  console.log('========================================')
  const counts = {
    merchants:       await prisma.merchant.count(),
    customers:       await prisma.customer.count(),
    payments:        await prisma.payment.count(),
    checkouts:       await prisma.checkout.count(),
    subscriptions:    await prisma.subscription.count(),
    recoveryCases:   await prisma.recoveryCase.count(),
    agentDecisions:  await prisma.agentDecision.count(),
    recoveryAttempts:await prisma.recoveryAttempt.count(),
    attributions:     await prisma.recoveryAttribution.count(),
    auditEvents:     await prisma.auditEvent.count(),
    communicationEvents: await prisma.communicationEvent.count(),
  }
  console.log(`  Merchants:             ${counts.merchants}`)
  console.log(`  Customers:             ${counts.customers}`)
  console.log(`  Payments:              ${counts.payments}`)
  console.log(`  Checkouts:             ${counts.checkouts}`)
  console.log(`  Subscriptions:         ${counts.subscriptions}`)
  console.log(`  Recovery Cases:        ${counts.recoveryCases}`)
  console.log(`  Agent Decisions:       ${counts.agentDecisions}`)
  console.log(`  Recovery Attempts:     ${counts.recoveryAttempts}`)
  console.log(`  Attributions:          ${counts.attributions}`)
  console.log(`  Audit Events:          ${counts.auditEvents}`)
  console.log(`  Communication Events: ${counts.communicationEvents}`)
  console.log('========================================')

  // Revenue at risk summary
  const totalAtRisk = await prisma.recoveryCase.aggregate({ _sum: { amountAtRisk: true } })
  const totalRecovered = await prisma.recoveryCase.aggregate({ _sum: { recoveredAmount: true } })
  console.log(`  Total at risk:    Rs.${(totalAtRisk._sum.amountAtRisk ?? 0) / 100}`)
  console.log(`  Total recovered:  Rs.${(totalRecovered._sum.recoveredAmount ?? 0) / 100}`)
  console.log('========================================\n')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
