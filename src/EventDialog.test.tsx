import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventDialog } from './components/EventDialog'
import type { CustomEvent } from './types'

/** Events are entered as start-and-end times; duration is derived, not typed. */
describe('EventDialog start/end times', () => {
  it('derives duration from the end time', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<EventDialog initial={null} isEditing={false} onSave={onSave} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText(/coffee shop/i), 'Cafe shift')
    await user.clear(screen.getByLabelText('Starts'))
    await user.type(screen.getByLabelText('Starts'), '09:00')
    await user.clear(screen.getByLabelText('Ends'))
    await user.type(screen.getByLabelText('Ends'), '17:30')

    expect(screen.getByText(/That's 8h 30m/)).toBeDefined()

    await user.click(screen.getByText('Save'))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toMatchObject({ startTime: '09:00', durationMins: 510 })
  })

  it('moves the end time along when the start changes, preserving length', async () => {
    const user = userEvent.setup()
    render(<EventDialog initial={null} isEditing={false} onSave={vi.fn()} onClose={() => {}} />)

    // Defaults are 17:00 for 3h.
    expect((screen.getByLabelText('Ends') as HTMLInputElement).value).toBe('20:00')

    await user.clear(screen.getByLabelText('Starts'))
    await user.type(screen.getByLabelText('Starts'), '18:00')

    expect((screen.getByLabelText('Ends') as HTMLInputElement).value).toBe('21:00')
  })

  it('refuses an end time that is not after the start', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<EventDialog initial={null} isEditing={false} onSave={onSave} onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText(/coffee shop/i), 'Night shift')
    await user.clear(screen.getByLabelText('Ends'))
    await user.type(screen.getByLabelText('Ends'), '16:00')

    expect(screen.getByText(/End time must be after the start time/i)).toBeDefined()
    await user.click(screen.getByText('Save'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('opens an existing event with its end time filled in', () => {
    const existing: CustomEvent = {
      id: 1, title: 'Gym', category: 'sport', recurrence: 'weekly', dayOfWeek: 'Wed',
      eventDate: null, startTime: '06:30', durationMins: 45, location: null, notes: null, color: null,
    }
    render(<EventDialog initial={existing} isEditing onSave={vi.fn()} onClose={() => {}} />)

    expect((screen.getByLabelText('Starts') as HTMLInputElement).value).toBe('06:30')
    expect((screen.getByLabelText('Ends') as HTMLInputElement).value).toBe('07:15')
    expect(screen.getByText(/That's 45m/)).toBeDefined()
  })
})
