/** Gmail event catalog for the Add Trigger picker. Phrases render as "When {phrase} in mailbox …". */
export interface TriggerEvent {
  id: string
  label: string
  phrase: string
}

export const GMAIL_EVENTS: TriggerEvent[] = [
  { id: 'new-email', label: 'New email', phrase: 'a new email is received' },
  { id: 'new-attachment', label: 'New attachment', phrase: 'an attachment is received' },
  { id: 'new-conversation', label: 'New conversation', phrase: 'a new conversation is started' },
  { id: 'keyword-search', label: 'New email matching keyword search', phrase: 'a new email matching your keyword search is received' },
  { id: 'labeled-conversation', label: 'Newly labeled conversation', phrase: 'a conversation is newly labeled' },
  { id: 'labeled-email', label: 'Newly labeled email or reply', phrase: 'an email or reply is newly labeled' },
  { id: 'starred-email', label: 'Newly starred email', phrase: 'an email is newly starred' },
  { id: 'new-label', label: 'New label', phrase: 'a new label is created' }
]

export function gmailEventPhrase(id: string): string {
  return GMAIL_EVENTS.find((e) => e.id === id)?.phrase ?? 'a new conversation is started'
}
