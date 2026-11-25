import { describe, expect, it } from 'vitest'
import { PHONE_HINT } from '@/lib/validators'
import {
  ALL_DRAFT_FIELDS_TOUCHED,
  EMPTY_DRAFT,
  addressToDraft,
  buildOrderBody,
  draftToAddressBody,
  formatAddressSummary,
  validateDraft,
  type AddressDraft,
  type AddressLite,
} from './checkout-model'

function draft(overrides: Partial<AddressDraft> = {}): AddressDraft {
  return {
    label: 'Home',
    recipient: 'Aung Aung',
    phone: '9123456789',
    divisionId: 'ygn',
    city: 'Yangon',
    township: 'Sanchaung',
    street: '12 Baho Rd',
    landmark: '',
    telegramUsername: '',
    mapsUrl: '',
    saveToAccount: true,
    ...overrides,
  }
}

const SAVED: AddressLite = {
  id: 'addr-1',
  label: 'Office',
  recipient: 'Su Su',
  phone: '+959123456789',
  divisionId: 'mdy',
  city: 'Mandalay',
  township: 'Chanayethazan',
  street: '5 78th St',
  landmark: null,
  telegramUsername: null,
  mapsUrl: null,
}

describe('validateDraft', () => {
  it('passes a complete draft', () => {
    expect(validateDraft(draft())).toEqual({})
  })

  it('flags every required field on the empty draft', () => {
    expect(validateDraft({ ...EMPTY_DRAFT, label: '' })).toEqual({
      label: 'Label is required.',
      recipient: 'Recipient name is required.',
      phone: 'Phone is required.',
      divisionId: 'Choose a division.',
      city: 'City is required.',
      township: 'Township is required.',
      street: 'Street is required.',
    })
  })

  it('explains the phone shape once something has been typed', () => {
    expect(validateDraft(draft({ phone: '123' }))).toEqual({ phone: PHONE_HINT })
  })

  it('leaves blank optional fields alone', () => {
    expect(validateDraft(draft({ telegramUsername: '  ', mapsUrl: ' ' }))).toEqual({})
  })

  it('judges optional fields once they are filled', () => {
    expect(validateDraft(draft({ telegramUsername: '1bad', mapsUrl: 'https://example.com' }))).toEqual({
      telegramUsername: '5-32 letters, digits or underscores, starting with a letter.',
      mapsUrl: 'Must be a Google Maps link.',
    })
  })
})

describe('ALL_DRAFT_FIELDS_TOUCHED', () => {
  it('covers every field validateDraft can flag', () => {
    const flagged = validateDraft({ ...EMPTY_DRAFT, label: '', telegramUsername: '1', mapsUrl: 'x' })
    for (const key of Object.keys(flagged)) {
      expect(ALL_DRAFT_FIELDS_TOUCHED).toHaveProperty(key, true)
    }
  })
})

describe('buildOrderBody', () => {
  it('sends a saved address by id', () => {
    expect(
      buildOrderBody({
        useNewAddress: false,
        draft: draft(),
        selectedAddressId: 'addr-1',
        paymentMethodId: 'kbz',
        notes: 'Ring twice',
      }),
    ).toEqual({ paymentMethodId: 'kbz', notes: 'Ring twice', shippingAddressId: 'addr-1' })
  })

  it('sends blank notes as null', () => {
    const body = buildOrderBody({
      useNewAddress: false,
      draft: draft(),
      selectedAddressId: 'addr-1',
      paymentMethodId: 'kbz',
      notes: '',
    })
    expect(body.notes).toBeNull()
  })

  it('sends a new address normalised, with blank optionals as null', () => {
    const body = buildOrderBody({
      useNewAddress: true,
      draft: draft({ phone: '09 123 456 789' }),
      selectedAddressId: 'addr-1',
      paymentMethodId: 'cod',
      notes: '',
    })
    expect(body).toEqual({
      paymentMethodId: 'cod',
      notes: null,
      newAddress: {
        label: 'Home',
        recipient: 'Aung Aung',
        phone: '+959123456789',
        divisionId: 'ygn',
        city: 'Yangon',
        township: 'Sanchaung',
        street: '12 Baho Rd',
        landmark: null,
        telegramUsername: null,
        mapsUrl: null,
        saveToAccount: true,
      },
    })
  })

  it('normalises filled optionals on a new address', () => {
    const body = buildOrderBody({
      useNewAddress: true,
      draft: draft({
        landmark: 'Near the pagoda',
        telegramUsername: '@aungaung',
        mapsUrl: ' https://maps.app.goo.gl/abc ',
        saveToAccount: false,
      }),
      selectedAddressId: '',
      paymentMethodId: 'kbz',
      notes: '',
    })
    expect(body.newAddress).toMatchObject({
      landmark: 'Near the pagoda',
      telegramUsername: 'aungaung',
      mapsUrl: 'https://maps.app.goo.gl/abc',
      saveToAccount: false,
    })
  })
})

describe('formatAddressSummary', () => {
  it('summarises the draft when entering a new address', () => {
    expect(formatAddressSummary(true, draft(), [SAVED], 'addr-1')).toBe(
      'Aung Aung · 12 Baho Rd, Sanchaung, Yangon',
    )
  })

  it('summarises the chosen saved address', () => {
    expect(formatAddressSummary(false, draft(), [SAVED], 'addr-1')).toBe(
      'Su Su · 5 78th St, Chanayethazan, Mandalay',
    )
  })

  it('shows a dash when the saved address is missing', () => {
    expect(formatAddressSummary(false, draft(), [SAVED], 'gone')).toBe('-')
  })
})

describe('editing a saved address', () => {
  const saved: AddressLite = {
    id: 'a1',
    label: 'Home',
    recipient: 'Aung Aung',
    phone: '+959123456789',
    divisionId: 'ygn',
    city: 'Yangon',
    township: 'Sanchaung',
    street: '12 Baho Rd',
    landmark: null,
    telegramUsername: 'aung',
    mapsUrl: null,
  }
  const divisions = [{ id: 'ygn', name: 'Yangon', deliveryFeeMmk: 3_000, codAllowed: true }]

  it('loads a saved address into the form in its typed form', () => {
    expect(addressToDraft(saved, divisions)).toEqual({
      label: 'Home',
      recipient: 'Aung Aung',
      phone: '9123456789',
      divisionId: 'ygn',
      city: 'Yangon',
      township: 'Sanchaung',
      street: '12 Baho Rd',
      landmark: '',
      telegramUsername: 'aung',
      mapsUrl: '',
      saveToAccount: true,
    })
  })

  it('clears a division checkout no longer delivers to, so one must be picked', () => {
    expect(addressToDraft({ ...saved, divisionId: 'kayah' }, divisions).divisionId).toBe('')
  })

  it('sends the same shape an order does, without the save flag', () => {
    const body = draftToAddressBody(addressToDraft(saved, divisions))
    expect(body).toEqual({
      label: 'Home',
      recipient: 'Aung Aung',
      phone: '+959123456789',
      divisionId: 'ygn',
      city: 'Yangon',
      township: 'Sanchaung',
      street: '12 Baho Rd',
      landmark: null,
      telegramUsername: 'aung',
      mapsUrl: null,
    })
    expect(body).not.toHaveProperty('saveToAccount')
  })
})
