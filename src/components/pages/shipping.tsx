import Link from 'next/link'
import { PageShell, Section, List } from '@/components/page/shell'
import { formatMmk } from '@/lib/money'
import { COD_CAP_MMK } from '@/lib/cod'
import { SITE } from '@/lib/site-info'
import { localePath, type Dict, type Locale } from '@/lib/i18n'

export const SHIPPING_PATH = '/shipping'

export interface DivisionFee {
  id: string
  name: string
  deliveryFeeMmk: number
  codAllowed: boolean
}

interface ShippingCopy {
  eyebrow: string
  title: string
  lead: string
  fees: {
    title: string
    division: string
    fee: string
    cod: string
    yes: string
    no: string
    empty: string
    uncovered: (names: readonly string[]) => string
  }
  timing: { title: string; items: readonly string[]; note: string }
  paying: { title: string; items: readonly string[] }
  packing: { title: string; body: string }
  international: { title: string; before: string; link: string; after: string }
}

/** "A", "A and B", "A, B and C". */
function listAnd(names: readonly string[]): string {
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const COPY: Dict<ShippingCopy> = {
  en: {
    eyebrow: 'Shipping',
    title: 'How your order gets to you.',
    lead: `Every order leaves from ${SITE.city} and travels by domestic courier. The fee depends on your division and is added at checkout, before you pay.`,
    fees: {
      title: 'Delivery fees',
      division: 'Division',
      fee: 'Fee',
      cod: 'Cash on delivery',
      yes: `Yes, up to ${formatMmk(COD_CAP_MMK)}`,
      no: 'No',
      empty: 'Fees are shown at checkout once you pick your division.',
      uncovered: (names) =>
        `Not covered yet: ${listAnd(names)}. No courier serves them at the moment; message us to ask.`,
    },
    timing: {
      title: 'Timing',
      items: [
        'Orders are packed the next working day after payment is confirmed.',
        `Within ${SITE.city}: usually 1 to 2 days.`,
        'Yangon and other main cities: usually 2 to 4 days.',
        'Remote townships: up to a week, depending on the courier route.',
        'We do not ship on Sundays or public holidays.',
      ],
      note: 'These are courier estimates, not guarantees. If a parcel is running late, message us and we will chase the tracking.',
    },
    paying: {
      title: 'Paying for your order',
      items: [
        'Bank transfer or mobile wallet: place the order, then upload the payment slip on your order page.',
        'Unpaid orders are cancelled automatically after 24 hours so stock returns to the shelf. An order with an uploaded slip is not cancelled while we check it.',
        `Cash on delivery is available in Yangon and Mandalay for orders up to ${formatMmk(COD_CAP_MMK)}, except monitors.`,
      ],
    },
    packing: {
      title: 'Packing',
      body: 'Boxes travel inside a padded outer carton, sealed and unbranded. Keyboards and speakers get an extra layer. If a parcel arrives damaged, photograph it before opening and send us the photos the same day.',
    },
    international: {
      title: 'International',
      before: 'We ship within Myanmar only. Returns and warranty claims are handled locally - see ',
      link: 'returns and warranty',
      after: '.',
    },
  },
  my: {
    eyebrow: 'ပို့ဆောင်ရေး',
    title: 'အော်ဒါ ဘယ်လို ရောက်လာမလဲ',
    lead: `အော်ဒါတိုင်းသည် ${SITE.city}မြို့မှ ပြည်တွင်း ပို့ဆောင်ရေးဖြင့် ထွက်ခွာသည်။ ပို့ခသည် တိုင်းဒေသကြီးအလိုက် ကွာခြားပြီး ငွေမပေးမီ ငွေရှင်းချိန်တွင် ပေါင်းထည့်ပါသည်။`,
    fees: {
      title: 'ပို့ခ နှုန်းထားများ',
      division: 'တိုင်းဒေသကြီး',
      fee: 'ပို့ခ',
      cod: 'အိမ်ရောက် ငွေချေ',
      // Burmese digits: COD_CAP_MMK written out, so update both together.
      yes: 'ရသည် (ကျပ် ၅၀၀,၀၀၀ အထိ)',
      no: 'မရပါ',
      empty: 'တိုင်းဒေသကြီး ရွေးပြီးလျှင် ငွေရှင်းချိန်တွင် ပို့ခ ပေါ်ပါမည်။',
      uncovered: (names) =>
        `လောလောဆယ် မပို့နိုင်သေးသော နေရာများ - ${names.join('၊ ')}။ ယခုအချိန်တွင် ပို့ဆောင်ရေး ဝန်ဆောင်မှု မရှိသေးပါ။ မေးမြန်းလိုပါက စာပို့ပါ။`,
    },
    timing: {
      title: 'ကြာချိန်',
      items: [
        'ငွေပေးချေမှု အတည်ပြုပြီးနောက် နောက်အလုပ်ရက်တွင် ပစ္စည်း ထုပ်ပိုးပါသည်။',
        `${SITE.city}မြို့တွင်း - ပုံမှန် ၁ ရက်မှ ၂ ရက်။`,
        'ရန်ကုန်နှင့် အခြားမြို့ကြီးများ - ပုံမှန် ၂ ရက်မှ ၄ ရက်။',
        'ဝေးလံသော မြို့နယ်များ - ကားလမ်းကြောင်းပေါ် မူတည်၍ တစ်ပတ်အထိ ကြာနိုင်သည်။',
        'တနင်္ဂနွေနေ့နှင့် အများပြည်သူ ရုံးပိတ်ရက်များတွင် မပို့ပါ။',
      ],
      note: 'ဤအချိန်များသည် ပို့ဆောင်ရေးဌာန၏ ခန့်မှန်းချက်သာဖြစ်ပြီး အာမခံချက် မဟုတ်ပါ။ ပစ္စည်း နောက်ကျနေပါက စာပို့လိုက်ပါ၊ ကျွန်ုပ်တို့ လိုက်စုံစမ်းပေးပါမည်။',
    },
    paying: {
      title: 'ငွေပေးချေခြင်း',
      items: [
        'ဘဏ်လွှဲ သို့မဟုတ် မိုဘိုင်းပိုက်ဆံအိတ် - အော်ဒါတင်ပြီး ငွေလွှဲပြေစာကို အော်ဒါစာမျက်နှာတွင် တင်ပါ။',
        'ငွေမပေးရသေးသော အော်ဒါများကို ၂၄ နာရီအကြာတွင် အလိုအလျောက် ပယ်ဖျက်ပြီး ပစ္စည်းကို စင်ပေါ် ပြန်တင်ပါသည်။ ငွေလွှဲပြေစာ တင်ပြီးသော အော်ဒါကို စစ်ဆေးနေစဉ် မပယ်ဖျက်ပါ။',
        'ရန်ကုန်နှင့် မန္တလေးတွင် ကျပ် ၅၀၀,၀၀၀ အထိ အော်ဒါများအတွက် အိမ်ရောက် ငွေချေစနစ် ရနိုင်သည်။ မော်နီတာများအတွက် မရပါ။',
      ],
    },
    packing: {
      title: 'ထုပ်ပိုးမှု',
      body: 'ပစ္စည်းဘူးများကို အခြေခံဘူးအပြင်ဘက်တွင် အနူးအညံ့ ထပ်ထုပ်ပြီး တံဆိပ်မပါဘဲ ချိပ်ပိတ် ပို့ပါသည်။ Keyboard နှင့် speaker များကို အလွှာတစ်ထပ် ပိုထည့်သည်။ ပစ္စည်းထုပ် ပျက်စီးလျက် ရောက်လာပါက မဖွင့်မီ ဓာတ်ပုံရိုက်ပြီး ထိုနေ့တွင်ပင် ပို့ပေးပါ။',
    },
    international: {
      title: 'နိုင်ငံရပ်ခြား',
      before: 'မြန်မာနိုင်ငံအတွင်းသာ ပို့ဆောင်ပါသည်။ ပြန်အမ်းခြင်းနှင့် အာမခံကို ပြည်တွင်း၌ပင် ဆောင်ရွက်ပေးသည် - ',
      link: 'ပြန်အမ်းခြင်းနှင့် အာမခံ',
      after: ' တွင် ကြည့်ပါ။',
    },
  },
}

export const SHIPPING_META: Dict<{ title: string; description: string }> = {
  en: {
    title: 'Shipping',
    description: `Delivery fees by division, timings, and how ${SITE.name} ships orders within Myanmar.`,
  },
  my: {
    title: 'ပို့ဆောင်ရေး',
    description: 'တိုင်းဒေသကြီးအလိုက် ပို့ခ၊ ပို့ဆောင်ချိန်နှင့် ငွေပေးချေနည်းများ။',
  },
}

interface ShippingViewProps {
  locale: Locale
  rows: readonly DivisionFee[]
  /** Divisions no courier serves yet. */
  uncovered: readonly string[]
}

export function ShippingView({ locale, rows, uncovered }: ShippingViewProps) {
  const t = COPY[locale]

  return (
    <PageShell
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
      path={SHIPPING_PATH}
      locale={locale}
    >
      <Section title={t.fees.title}>
        {rows.length > 0 ? (
          <div className="overflow-hidden rounded-[var(--radius)] border border-line">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="bg-surface text-left text-[12px] tracking-[0.08em] text-muted uppercase">
                  <th className="px-4 py-3 font-medium">{t.fees.division}</th>
                  <th className="px-4 py-3 font-medium">{t.fees.fee}</th>
                  <th className="px-4 py-3 font-medium">{t.fees.cod}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-t border-line text-ink">
                    <td className="px-4 py-3">{d.name}</td>
                    <td className="price px-4 py-3">{formatMmk(d.deliveryFeeMmk)}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {d.codAllowed ? t.fees.yes : t.fees.no}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{t.fees.empty}</p>
        )}
        {uncovered.length > 0 ? <p>{t.fees.uncovered(uncovered)}</p> : null}
      </Section>

      <Section title={t.timing.title}>
        <List items={t.timing.items} />
        <p>{t.timing.note}</p>
      </Section>

      <Section title={t.paying.title}>
        <List items={t.paying.items} />
      </Section>

      <Section title={t.packing.title}>
        <p>{t.packing.body}</p>
      </Section>

      <Section title={t.international.title}>
        <p>
          {t.international.before}
          <Link
            href={localePath(locale, '/returns')}
            className="text-ink underline underline-offset-4 hover:text-accent"
          >
            {t.international.link}
          </Link>
          {t.international.after}
        </p>
      </Section>
    </PageShell>
  )
}
