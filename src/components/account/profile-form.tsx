'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { TextField } from '@/components/ui/field'
import { api } from '@/lib/api-client'
import { maxLen } from '@/lib/validators'

interface ProfileFormProps {
  initialName: string
  email: string
}

/** The customer's name, editable. The email is the sign-in and is never changed. */
export function ProfileForm({ initialName, email }: ProfileFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const error = maxLen(name.trim(), 120, 'Name')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (error) return
    setSaving(true)
    const res = await api<{ name: string | null }>('/api/v1/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: name.trim() }),
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error?.message ?? 'Could not save your name.')
      return
    }
    toast('Name saved.')
    router.refresh()
  }

  return (
    <form onSubmit={save} noValidate className="mt-4 space-y-4">
      <TextField
        label="Name"
        autoComplete="name"
        value={name}
        onChange={setName}
        error={error}
        helper="Also shows on reviews you write."
      />
      <div>
        <div className="text-[12px] text-muted">Email</div>
        <div className="mt-1 text-[14px] text-ink">{email}</div>
        <p className="mt-1 text-[12px] text-muted">The account cannot be changed</p>
      </div>
      <button
        type="submit"
        disabled={saving || name.trim() === initialName.trim()}
        className="inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-ink px-6 py-2.5 text-[14px] font-medium text-cream transition-colors hover:bg-accent disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
