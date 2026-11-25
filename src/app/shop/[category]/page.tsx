import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { GridControls } from '@/components/shop/grid-controls'
import { ShopGridSkeleton } from '@/components/shop/grid-skeleton'
import { getCategoryById, getProductsByCategory } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  const cat = await getCategoryById(category)
  if (!cat) return { title: 'Not found' }
  return {
    title: cat.name,
    description: cat.description,
    alternates: { canonical: `/shop/${cat.id}` },
  }
}

async function CategoryGrid({ id }: { id: string }) {
  const items = await getProductsByCategory(id)
  return <GridControls all={items} activeCategory={id} />
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params

  // Resolved before anything streams. A `loading.tsx` here would send the 200
  // header first and turn every unknown slug into a soft 404 - the bug that
  // got the root loading file deleted. `getCategoryById` reads an in-memory
  // array, so this check costs nothing and the decision is made up front.
  const cat = await getCategoryById(category)
  if (!cat) notFound()

  return (
    <section className="container-prose pt-8 pb-16 md:py-20">
      <div className="eyebrow">Shop · {cat.name}</div>
      <h1 className="mt-2 font-display text-[32px] leading-[1.05] text-ink sm:mt-3 sm:text-[40px] md:text-[56px]">
        {cat.name}.
      </h1>
      {/* Hidden on phones, where it pushed the first price below the fold. */}
      <p className="mt-4 hidden max-w-[52ch] text-[15px] text-ink-soft sm:block">{cat.description}</p>

      <div className="mt-6 md:mt-10">
        <Suspense fallback={<ShopGridSkeleton />}>
          <CategoryGrid id={cat.id} />
        </Suspense>
      </div>
    </section>
  )
}
