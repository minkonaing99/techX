import { describe, expect, it } from 'vitest'
import type { ProductFormValues } from './product-details-form'
import {
  emptyForm,
  formIsDirty,
  formToBody,
  formToPatch,
  formToRow,
  rowToForm,
  validateForm,
  type Row,
} from './product-form'

function form(overrides: Partial<ProductFormValues> = {}): ProductFormValues {
  return {
    name: 'Kestrel 75',
    slug: 'kestrel-75',
    categoryId: 'keyboards',
    priceMmk: '250000',
    salePriceMmk: '',
    tagline: 'A quiet board',
    description: 'Gasket mount.',
    swatch: '#7A4F36',
    stockQty: '4',
    lowStockThreshold: '3',
    sortOrder: '0',
    isActive: true,
    featured: false,
    specs: [{ label: 'Layout', value: '75%' }],
    ...overrides,
  }
}

const ROW: Row = {
  id: 'kestrel-75',
  name: 'Kestrel 75',
  slug: 'kestrel-75',
  categoryId: 'keyboards',
  priceMmk: 250000,
  salePriceMmk: null,
  tagline: 'A quiet board',
  description: 'Gasket mount.',
  swatch: '#7A4F36',
  stockQty: 4,
  lowStockThreshold: 3,
  sortOrder: 0,
  featured: false,
  isActive: true,
  hasPhotos: true,
  specs: [{ label: 'Layout', value: '75%' }],
  textVersion: 'a'.repeat(64),
}

describe('validateForm', () => {
  it('passes a complete form', () => {
    expect(validateForm(form(), true, new Set())).toEqual([])
  })

  it.each([
    [{ name: '  ' }, 'Name is required.'],
    [{ slug: 'Bad Slug' }, 'Slug must be lowercase letters, digits, and dashes only.'],
    [{ categoryId: '' }, 'Pick a category.'],
    [{ priceMmk: '-1' }, 'Price must be a non-negative number.'],
    [{ priceMmk: 'abc' }, 'Price must be a non-negative number.'],
    [{ salePriceMmk: 'abc' }, 'Sale price must be a number, or blank for no sale.'],
    [{ tagline: '' }, 'Tagline is required.'],
    [{ description: ' ' }, 'Description is required.'],
    [{ swatch: '#abc' }, 'Swatch must be a 6-digit hex.'],
    [{ stockQty: '-2' }, 'Stock must be a non-negative number.'],
    [{ lowStockThreshold: 'x' }, 'Low-stock threshold must be a non-negative number.'],
  ])('refuses %o', (overrides, message) => {
    expect(validateForm(form(overrides), false, new Set())).toEqual([message])
  })

  it('uses the shared sale-price message when the sale is not below the price', () => {
    expect(validateForm(form({ salePriceMmk: '250000' }), false, new Set())).toEqual([
      'Sale price 250000 must be 0 or more and below the normal price 250000.',
    ])
  })

  it('flags a taken slug only when creating', () => {
    const taken = new Set(['kestrel-75'])
    expect(validateForm(form(), true, taken)).toEqual(['Slug already in use.'])
    expect(validateForm(form(), false, taken)).toEqual([])
  })

  it('reports incomplete specs once, however many rows are bad', () => {
    const specs = [
      { label: '', value: 'a' },
      { label: 'b', value: '' },
    ]
    expect(validateForm(form({ specs }), false, new Set())).toEqual([
      'Every spec row needs both a label and a value (or remove the row).',
    ])
  })
})

describe('formToBody', () => {
  it('trims text and specs and converts numbers', () => {
    const body = formToBody(
      form({
        name: ' Kestrel ',
        tagline: ' t ',
        description: ' d ',
        specs: [{ label: ' Layout ', value: ' 75% ' }],
      }),
    )
    expect(body).toMatchObject({
      name: 'Kestrel',
      tagline: 't',
      description: 'd',
      priceMmk: 250000,
      stockQty: 4,
      sortOrder: 0,
      specs: [{ label: 'Layout', value: '75%' }],
    })
  })

  it('sends a blank sale price as null and a set one as a number', () => {
    expect(formToBody(form({ salePriceMmk: ' ' })).salePriceMmk).toBeNull()
    expect(formToBody(form({ salePriceMmk: '200000' })).salePriceMmk).toBe(200000)
  })

  it('falls back to 3 when the low-stock threshold is 0 or unparseable', () => {
    expect(formToBody(form({ lowStockThreshold: '0' })).lowStockThreshold).toBe(3)
    expect(formToBody(form({ lowStockThreshold: 'x' })).lowStockThreshold).toBe(3)
  })
})

describe('formIsDirty', () => {
  it('is false for identical forms', () => {
    expect(formIsDirty(form(), form())).toBe(false)
  })

  it.each([
    ['name', 'Other'],
    ['slug', 'other'],
    ['categoryId', 'mice'],
    ['priceMmk', '1'],
    ['salePriceMmk', '1'],
    ['tagline', 'x'],
    ['description', 'x'],
    ['swatch', '#000000'],
    ['stockQty', '9'],
    ['lowStockThreshold', '9'],
    ['sortOrder', '9'],
    ['isActive', false],
    ['featured', true],
  ] as const)('notices a change to %s', (key, value) => {
    expect(formIsDirty(form(), form({ [key]: value }))).toBe(true)
  })

  it('notices an added spec row and an edited one', () => {
    expect(formIsDirty(form(), form({ specs: [] }))).toBe(true)
    expect(formIsDirty(form(), form({ specs: [{ label: 'Layout', value: '65%' }] }))).toBe(true)
  })
})

describe('rowToForm', () => {
  it('stringifies numbers and blanks a null sale price', () => {
    expect(rowToForm(ROW)).toEqual(form())
  })

  it('copies specs so editing the form cannot touch the row', () => {
    const f = rowToForm(ROW)
    expect(f.specs).not.toBe(ROW.specs)
    expect(f.specs[0]).not.toBe(ROW.specs[0])
  })
})

describe('emptyForm', () => {
  it('starts in the given category with the house defaults', () => {
    expect(emptyForm('mice')).toMatchObject({
      categoryId: 'mice',
      priceMmk: '0',
      swatch: '#7A4F36',
      lowStockThreshold: '3',
      isActive: true,
      specs: [],
    })
  })
})

describe('formToRow', () => {
  it('builds a fresh row from the server slug', () => {
    const f = form({ name: ' Kestrel 75 ', salePriceMmk: '200000' })
    const row = formToRow(f, { id: 'kestrel-75', slug: 'kestrel-75', hasPhotos: false, textVersion: ROW.textVersion })
    expect(row).toEqual({
      ...ROW,
      salePriceMmk: 200000,
      hasPhotos: false,
      specs: f.specs,
    })
  })

  it('keeps id, slug and photos from the row being edited', () => {
    const row = formToRow(form({ slug: 'ignored' }), ROW)
    expect(row.id).toBe(ROW.id)
    expect(row.slug).toBe(ROW.slug)
    expect(row.hasPhotos).toBe(true)
  })

  it('keeps specs as typed, untrimmed', () => {
    const specs = [{ label: ' Layout ', value: ' 75% ' }]
    expect(formToRow(form({ specs }), ROW).specs).toBe(specs)
  })

  it('applies the same number fallbacks as the request body', () => {
    const row = formToRow(form({ priceMmk: 'x', stockQty: '', lowStockThreshold: '0' }), ROW)
    expect(row).toMatchObject({ priceMmk: 0, stockQty: 0, lowStockThreshold: 3 })
  })
})

describe('formToPatch', () => {
  it('leaves stock out when the admin did not change it', () => {
    // A price edit must not write back the stock number the page loaded with.
    const patch = formToPatch(form({ priceMmk: '240000' }), ROW)
    expect(patch).not.toHaveProperty('stockQty')
    expect(patch).not.toHaveProperty('stockQtyWas')
    expect(patch).toMatchObject({ priceMmk: 240000 })
  })

  it('sends a changed stock number with the number it replaces', () => {
    const patch = formToPatch(form({ stockQty: '9' }), ROW)
    expect(patch).toMatchObject({ stockQty: 9, stockQtyWas: 4 })
  })

  it('sends the text fingerprint the page loaded, so a newer edit from the Mac is not overwritten', () => {
    expect(formToPatch(form({ name: 'Renamed' }), ROW)).toMatchObject({ name: 'Renamed', textWas: ROW.textVersion })
  })
})
