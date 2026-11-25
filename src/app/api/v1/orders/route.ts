import { NextResponse } from 'next/server'
import { fail, ok, rateLimited } from '@/lib/api-response'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { orders, orderItems } from '@/db/schema/orders'
import { addresses } from '@/db/schema/addresses'
import { cartItems } from '@/db/schema/carts'
import { users } from '@/db/schema/auth'
import { divisions } from '@/db/schema/divisions'
import { paymentMethods } from '@/db/schema/payment-methods'
import { auth } from '@/lib/auth'
import { UUID_RE } from '@/lib/ids'
import { optionalMapsUrl, optionalTelegram, phoneField } from '@/lib/address-fields'
import { getCart } from '@/lib/cart-session'
import { unorderableLines, unorderableMessage } from '@/lib/cart-availability'
import { mailOrAlert } from '@/lib/notify'
import { maskEmail } from '@/lib/mask'
import { formatMmk } from '@/lib/money'
import { COD_CAP_MMK, NO_COD_MESSAGE, cartAllowsCod } from '@/lib/cod'
import { adminOrderUrl, orderUrl } from '@/lib/links'
import { shortOrderId } from '@/lib/order-status'
import { cartSubtotal, effectiveUnitPrice, isOnSale } from '@/lib/pricing'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { sendTelegram } from '@/lib/telegram'
import { NewOrderAlert } from '@emails/new-order-alert'
import { OrderPlaced } from '@emails/order-placed'
import { ORDER_EXPIRY_MS } from '@/lib/order-transitions'
import { isOfferable } from '@/lib/payment-methods'
import { OutOfStockError, sendLowStockAlerts, takeStock, type LowStock } from '@/lib/stock'
import { revalidateTag } from 'next/cache'

/**
 * Orders one customer may have waiting at once. Each holds its stock for up to
 * a day, so without a cap one account could park the last units of everything.
 */
const OPEN_ORDER_CAP = 3
/** Internal transaction-abort signal: the cart was already turned into an order. */
const CART_ALREADY_ORDERED = 'CART_ALREADY_ORDERED'
/** Internal transaction-abort signal: the customer is at the open-order cap. */
const TOO_MANY_OPEN_ORDERS = 'TOO_MANY_OPEN_ORDERS'

const newAddressSchema = z.object({
  label: z.string().min(1).max(40),
  recipient: z.string().min(1).max(120),
  phone: phoneField,
  divisionId: z.string().min(1).max(40),
  city: z.string().min(1).max(120),
  township: z.string().min(1).max(120),
  street: z.string().min(1).max(200),
  landmark: z.string().max(200).nullable().optional(),
  telegramUsername: optionalTelegram,
  mapsUrl: optionalMapsUrl,
  saveToAccount: z.boolean().optional().default(false),
})

const bodySchema = z
  .object({
    shippingAddressId: z.string().regex(UUID_RE).optional(),
    newAddress: newAddressSchema.optional(),
    paymentMethodId: z.string().min(1).max(40),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine((b) => Boolean(b.shippingAddressId) !== Boolean(b.newAddress), {
    message: 'Provide either shippingAddressId or newAddress (not both).',
  })

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return fail('UNAUTHENTICATED', 'Sign in required.', 401)
  }
  const userId = session.user.id

  const limit = rateLimit({
    key: clientKey(req, `orders:${userId}`),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (!limit.allowed) {
    return rateLimited('Too many orders.', limit.retryAfterSeconds)
  }

  const raw = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }

  let shippingAddressId: string
  let divisionId: string
  // Held rather than written. Everything below can still reject the checkout,
  // and a rejected checkout must not leave an address on the customer's account
  // - nor hand an unchecked `divisionId` to the foreign key, which surfaces as
  // a 500 instead of the 400 the division lookup gives.
  let addressToCreate: typeof addresses.$inferInsert | null = null
  // Copied onto the order below rather than read back through the address FK.
  // Address rows stay editable and deletable by the customer, so the join was
  // never a stable answer to "where does this parcel go".
  let ship: {
    recipient: string
    phone: string
    telegram: string | null
    city: string
    township: string
    street: string
    landmark: string | null
    mapsUrl: string | null
  }

  if (parsed.data.shippingAddressId) {
    const [addr] = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, parsed.data.shippingAddressId), eq(addresses.userId, userId)))
      .limit(1)
    if (!addr) {
      return fail('NOT_FOUND', 'Address not found.', 404)
    }
    shippingAddressId = addr.id
    divisionId = addr.divisionId
    ship = {
      recipient: addr.recipient,
      phone: addr.phone,
      telegram: addr.telegramUsername,
      city: addr.city,
      township: addr.township,
      street: addr.street,
      landmark: addr.landmark,
      mapsUrl: addr.mapsUrl,
    }
  } else if (parsed.data.newAddress) {
    const na = parsed.data.newAddress
    divisionId = na.divisionId
    shippingAddressId = randomUUID()
    addressToCreate = {
      id: shippingAddressId,
      userId,
      label: na.saveToAccount ? na.label : `Order ${new Date().toISOString().slice(0, 10)}`,
      recipient: na.recipient,
      phone: na.phone,
      divisionId: na.divisionId,
      city: na.city,
      township: na.township,
      street: na.street,
      landmark: na.landmark ?? null,
      telegramUsername: na.telegramUsername,
      mapsUrl: na.mapsUrl,
      isDefault: false,
    }
    ship = {
      recipient: na.recipient,
      phone: na.phone,
      telegram: na.telegramUsername,
      city: na.city,
      township: na.township,
      street: na.street,
      landmark: na.landmark ?? null,
      mapsUrl: na.mapsUrl,
    }
  } else {
    return fail('VALIDATION_ERROR', 'Missing address.', 400)
  }

  const [division] = await db
    .select()
    .from(divisions)
    .where(eq(divisions.id, divisionId))
    .limit(1)
  if (!division || division.isBlocked) {
    return fail('VALIDATION_ERROR', 'Delivery to that division is unavailable.', 400)
  }

  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, parsed.data.paymentMethodId), eq(paymentMethods.isActive, true)))
    .limit(1)
  // Same rule as the checkout list: a method checkout hides is not orderable here.
  if (!method || !isOfferable(method)) {
    return fail('VALIDATION_ERROR', 'Payment method unavailable.', 400)
  }

  const { cartId, lines } = await getCart()
  if (lines.length === 0) {
    return fail('VALIDATION_ERROR', 'Cart is empty.', 400)
  }

  const subtotal = cartSubtotal(lines)
  const deliveryFee = division.deliveryFeeMmk
  const total = subtotal + deliveryFee

  if (method.kind === 'cod') {
    if (!cartAllowsCod(lines.map((l) => l.product.category))) {
      return fail('VALIDATION_ERROR', NO_COD_MESSAGE, 400)
    }
    if (!division.codAllowed || total > COD_CAP_MMK) {
      return fail('VALIDATION_ERROR', `Cash on Delivery available only for Yangon/Mandalay orders up to ${formatMmk(COD_CAP_MMK)}.`, 400)
    }
  }

  // A first look, before any locks. The binding check is the guarded decrement
  // inside the transaction below; this one exists to name every bad line at
  // once, so the customer fixes the cart in one pass.
  //
  // Every bad line, not the first: the customer fixes the cart in one pass
  // instead of resubmitting to discover the next one. `isActive` is checked
  // here too - it used to be read when adding to the cart and never again, so
  // a product retired in /admin still ordered while stock remained.
  const unorderable = unorderableLines(lines)
  if (unorderable.length > 0) {
    return fail('CART_UNORDERABLE', unorderableMessage(lines, unorderable), 409, {
      lines: unorderable,
    })
  }

  const orderId = randomUUID()
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS)
  let lowStock: LowStock[] = []

  try {
    await db.transaction(async (tx) => {
      // First write, and the guard against one cart becoming two orders: a
      // double-click, a second tab or a browser retry can all read the cart
      // before this request empties it. The second delete blocks on these rows
      // until this transaction commits, then finds nothing and aborts before it
      // has written an order.
      const [emptied] = await tx.delete(cartItems).where(eq(cartItems.cartId, cartId))
      if (emptied.affectedRows === 0) throw new Error(CART_ALREADY_ORDERED)

      // Counted under a lock on the customer's row, so two checkouts from
      // refilled carts queue here instead of both reading two and both passing.
      // Only orders that hold stock count: that is what the cap bounds.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
      const [held] = await tx
        .select({ open: count() })
        .from(orders)
        .where(
          and(
            eq(orders.userId, userId),
            eq(orders.stockReserved, true),
            inArray(orders.status, ['pending_payment', 'payment_submitted']),
          ),
        )
      if ((held?.open ?? 0) >= OPEN_ORDER_CAP) throw new Error(TOO_MANY_OPEN_ORDERS)

      // The order holds its stock from here until it is confirmed or cancelled.
      // Guarded per line and taken in product-id order (see src/lib/stock.ts);
      // a line the shop can no longer fill rolls everything back, cart included.
      lowStock = await takeStock(tx, lines)

      // Inside the transaction so the address and the order it exists for are
      // written together or not at all.
      if (addressToCreate) {
        await tx.insert(addresses).values(addressToCreate)
      }

      await tx.insert(orders).values({
        id: orderId,
        userId,
        status: 'pending_payment',
        subtotalMmk: subtotal,
        deliveryFeeMmk: deliveryFee,
        totalMmk: total,
        shippingAddressId,
        shipRecipient: ship.recipient,
        shipPhone: ship.phone,
        shipTelegram: ship.telegram,
        shipDivisionId: divisionId,
        shipDivisionName: division.name,
        shipCity: ship.city,
        shipTownship: ship.township,
        shipStreet: ship.street,
        shipLandmark: ship.landmark,
        shipMapsUrl: ship.mapsUrl,
        paymentMethodId: method.id,
        paymentRef: orderId,
        expiresAt,
        stockReserved: true,
        notes: parsed.data.notes ?? null,
      })

      await tx.insert(orderItems).values(
        lines.map((l) => ({
          orderId,
          productId: l.productId,
          qty: l.qty,
          unitPriceMmkSnapshot: effectiveUnitPrice(l.product.priceMmk, l.product.salePriceMmk),
          listPriceMmkSnapshot: isOnSale(l.product.priceMmk, l.product.salePriceMmk)
            ? l.product.priceMmk
            : null,
          nameSnapshot: l.product.name,
        })),
      )
    })
  } catch (err) {
    if (err instanceof Error && err.message === CART_ALREADY_ORDERED) {
      return fail('CART_ALREADY_ORDERED', 'This cart has already been ordered. Check your orders.', 409)
    }
    if (err instanceof Error && err.message === TOO_MANY_OPEN_ORDERS) {
      return fail(
        'TOO_MANY_OPEN_ORDERS',
        `You already have ${OPEN_ORDER_CAP} orders holding stock. Wait for one to be confirmed, or cancel an unpaid one, before placing another.`,
        409,
      )
    }
    if (err instanceof OutOfStockError) {
      // Another checkout took the stock after the first look. The rollback
      // kept the cart, so reading it again says what is left now.
      const { lines: now } = await getCart()
      const short = unorderableLines(now)
      const message =
        short.length > 0
          ? unorderableMessage(now, short)
          : 'An item in your cart just sold out. Review your cart and try again.'
      return fail('CART_UNORDERABLE', message, 409, { lines: short })
    }
    throw err
  }
  revalidateTag('products')

  // The buyer hears nothing else until we confirm, so this carries what they
  // need in the meantime: what they bought, and for a wallet order, where to
  // send the money. A failure never fails the request - a dead SMTP must never
  // lose an order that is already committed - and the owner is alerted.
  if (session.user.email) {
    await mailOrAlert({
      to: session.user.email,
      subject:
        method.kind === 'wallet'
          ? `Order ${shortOrderId(orderId)} - placed, transfer to complete`
          : `Order ${shortOrderId(orderId)} - placed, we will call to confirm`,
      react: OrderPlaced({
        orderId,
        orderUrl: orderUrl(orderId),
        method: method.name,
        kind: method.kind,
        accountName: method.accountName,
        accountPhone: method.accountPhone,
        total: formatMmk(total),
        subtotal: formatMmk(subtotal),
        deliveryFee: formatMmk(deliveryFee),
        placedAt: new Date().toISOString(),
        items: lines.map((l) => ({
          qty: l.qty,
          name: l.product.name,
          lineTotal: formatMmk(effectiveUnitPrice(l.product.priceMmk, l.product.salePriceMmk) * l.qty),
        })),
      }),
    }, `order ${shortOrderId(orderId)} placed (customer)`)
  }

  const ownerEmail = process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? 'admin@localhost'
  await mailOrAlert({
    to: ownerEmail,
    subject:
      method.kind === 'cod'
        ? `COD order ${shortOrderId(orderId)} - call to confirm, ${formatMmk(total)}`
        : `New order ${shortOrderId(orderId)} - ${formatMmk(total)}`,
    react: NewOrderAlert({
      orderId,
      adminUrl: adminOrderUrl(orderId),
      total: formatMmk(total),
      subtotal: formatMmk(subtotal),
      deliveryFee: formatMmk(deliveryFee),
      method: method.name,
      kind: method.kind,
      customer: session.user.email ?? userId,
      recipient: ship.recipient,
      phone: ship.phone,
      destination: [ship.township, ship.city, division.name].filter(Boolean).join(', '),
      items: lines.map((l) => ({
        qty: l.qty,
        name: l.product.name,
        lineTotal: formatMmk(effectiveUnitPrice(l.product.priceMmk, l.product.salePriceMmk) * l.qty),
      })),
    }),
  }, `order ${shortOrderId(orderId)} new-order alert (owner)`)

  // Telegram is a third party. The alert is a nudge to go look at the order, so
  // it carries the reference and a masked address - never the address itself.
  // The full details are in the owner's own inbox via NewOrderAlert above.
  await sendTelegram(
    `🆕 New order ${orderId.slice(0, 8)}\nMethod: ${method.name}\nTotal: ${formatMmk(total)}\nCustomer: ${
      session.user.email ? maskEmail(session.user.email) : '****'
    }`,
  )
  await sendLowStockAlerts(lowStock)

  return ok({ orderId })
}

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return fail('UNAUTHENTICATED', 'Sign in required.', 401)
  }
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.placedAt))
  return ok(rows)
}
