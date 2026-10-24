import { TOOL_IDS } from '../../../shared/types.js'

/** One Composio trigger config parameter. */
export interface TriggerConfigField {
  /** Parameter name from the trigger type's config schema. */
  key: string
  label: string
  placeholder: string
  /** Fixed choices for enum-like parameters. */
  options?: string[]
}

/** Trigger catalog for the Add Trigger picker. Phrases render as "When {phrase} …". */
export interface TriggerEvent {
  id: string
  label: string
  phrase: string
  /** Config params the Composio trigger type declares, when it declares any. */
  config?: TriggerConfigField[]
}

export interface TriggerApp {
  /** Connector/toolkit id used by the compiled automation. */
  id: string
  label: string
  /** Brand color for the neutral fallback icon. */
  color: string
  events: TriggerEvent[]
}

// Config fields mirror the trigger types in the Composio docs (toolkits/*.md).
const GMAIL_FILTERS: TriggerConfigField[] = [
  { key: 'query', label: 'Search', placeholder: 'from:boss@company.com is:unread' },
  { key: 'labelIds', label: 'Label', placeholder: 'INBOX' }
]

const OUTLOOK_FILTERS: TriggerConfigField[] = [
  { key: 'from_email', label: 'From', placeholder: 'boss@company.com' },
  { key: 'subject_contains', label: 'Subject contains', placeholder: 'invoice' },
  { key: 'has_attachments', label: 'Attachments', placeholder: 'Any', options: ['true', 'false'] }
]

const SLACK_CHANNEL: TriggerConfigField[] = [
  { key: 'channel_id', label: 'Channel', placeholder: 'C0123456789' },
  { key: 'channel_type', label: 'Type', placeholder: 'Any', options: ['channel', 'group', 'mpim'] },
  { key: 'is_bot_message', label: 'From', placeholder: 'Anyone', options: ['false', 'true'] }
]

const SLACK_REACTION: TriggerConfigField[] = [
  { key: 'channel_id', label: 'Channel', placeholder: 'C0123456789' },
  { key: 'emoji_name', label: 'Emoji', placeholder: 'thumbsup' }
]

const CALENDAR_FILTERS: TriggerConfigField[] = [
  { key: 'calendarId', label: 'Calendar', placeholder: 'primary' }
]

const DRIVE_FILTERS: TriggerConfigField[] = [
  { key: 'folder_id', label: 'Folder ID', placeholder: '1AbCdEf…' },
  { key: 'query', label: 'Search', placeholder: "name contains 'report'" }
]

const GITHUB_REPO: TriggerConfigField[] = [
  { key: 'owner', label: 'Owner', placeholder: 'octocat' },
  { key: 'repo', label: 'Repo', placeholder: 'hello-world' }
]

export const GMAIL_EVENTS: TriggerEvent[] = [
  { id: 'new-email', label: 'New email', phrase: 'a new email is received', config: GMAIL_FILTERS },
  { id: 'new-attachment', label: 'New attachment', phrase: 'an attachment is received', config: GMAIL_FILTERS },
  { id: 'new-conversation', label: 'New conversation', phrase: 'a new conversation is started', config: GMAIL_FILTERS },
  { id: 'keyword-search', label: 'New email matching keyword search', phrase: 'a new email matching your keyword search is received', config: GMAIL_FILTERS },
  { id: 'labeled-conversation', label: 'Newly labeled conversation', phrase: 'a conversation is newly labeled' },
  { id: 'labeled-email', label: 'Newly labeled email or reply', phrase: 'an email or reply is newly labeled' },
  { id: 'starred-email', label: 'Newly starred email', phrase: 'an email is newly starred' },
  { id: 'new-label', label: 'New label', phrase: 'a new label is created' }
]

/** Every app with event triggers, in the same order as the Composio picker grid. */
export const TRIGGER_APPS: TriggerApp[] = [
  {
    id: 'gmail', label: 'Gmail', color: '#EA4335',
    events: GMAIL_EVENTS
  },
  {
    id: 'outlook', label: 'Outlook Mail', color: '#0F6CBD',
    events: [
      { id: 'new-email', label: 'New email', phrase: 'a new email arrives', config: OUTLOOK_FILTERS },
      { id: 'new-attachment', label: 'New attachment', phrase: 'an attachment arrives', config: OUTLOOK_FILTERS },
      { id: 'keyword-search', label: 'New email matching keyword search', phrase: 'a new email matching your keyword search arrives', config: OUTLOOK_FILTERS },
      { id: 'flagged-email', label: 'Newly flagged email', phrase: 'an email is newly flagged' },
      { id: 'moved-email', label: 'Email moved to a folder', phrase: 'an email is moved to a folder' }
    ]
  },
  {
    id: 'mailmanus', label: 'Mail Manus', color: '#8B5CF6',
    events: [
      { id: 'new-email', label: 'New email', phrase: 'a new email arrives' },
      { id: 'new-reply', label: 'New reply', phrase: 'a reply is received' }
    ]
  },
  {
    id: 'slack', label: 'Slack', color: '#611F69',
    events: [
      { id: 'new-message', label: 'New message in a channel', phrase: 'a new message is posted in a channel', config: SLACK_CHANNEL },
      { id: 'new-mention', label: 'New mention', phrase: 'you are mentioned in a message' },
      { id: 'new-reaction', label: 'New reaction', phrase: 'a message gets a new reaction', config: SLACK_REACTION },
      { id: 'new-file', label: 'New file shared', phrase: 'a file is shared' },
      { id: 'new-member', label: 'New member joins', phrase: 'a member joins the workspace' },
      { id: 'new-channel', label: 'New channel created', phrase: 'a channel is created' }
    ]
  },
  {
    id: 'notion', label: 'Notion', color: '#E8E8E8',
    events: [
      { id: 'new-page', label: 'New page in a database', phrase: 'a new page is added to a database' },
      { id: 'page-updated', label: 'Page updated', phrase: 'a page is updated' },
      { id: 'new-comment', label: 'New comment', phrase: 'a new comment is added', config: [{ key: 'page_id', label: 'Page', placeholder: 'Page ID' }] },
      { id: 'new-entry', label: 'New database entry', phrase: 'a new database entry is created' }
    ]
  },
  {
    id: 'googlecalendar', label: 'Google Calendar', color: '#4285F4',
    events: [
      { id: 'new-event', label: 'New event', phrase: 'a new event is created', config: CALENDAR_FILTERS },
      { id: 'updated-event', label: 'Event updated', phrase: 'an event is updated', config: CALENDAR_FILTERS },
      { id: 'cancelled-event', label: 'Event cancelled', phrase: 'an event is cancelled', config: CALENDAR_FILTERS },
      {
        id: 'starting-event',
        label: 'Event starting soon',
        phrase: 'an event is about to start',
        config: [...CALENDAR_FILTERS, { key: 'minutesBeforeStart', label: 'Minutes before', placeholder: '10' }]
      },
      { id: 'attendee-response', label: 'Attendee response', phrase: 'an attendee responds to an invite', config: CALENDAR_FILTERS }
    ]
  },
  {
    id: 'outlookcalendar', label: 'Outlook Calendar', color: '#0F6CBD',
    events: [
      { id: 'new-event', label: 'New event', phrase: 'a new event is created' },
      { id: 'updated-event', label: 'Event updated', phrase: 'an event is updated' },
      { id: 'cancelled-event', label: 'Event cancelled', phrase: 'an event is cancelled' },
      { id: 'starting-event', label: 'Event starting soon', phrase: 'an event is about to start' }
    ]
  },
  {
    id: 'github', label: 'GitHub', color: '#6E7681',
    events: [
      { id: 'new-issue', label: 'New issue', phrase: 'a new issue is opened', config: GITHUB_REPO },
      { id: 'new-pr', label: 'New pull request', phrase: 'a new pull request is opened', config: GITHUB_REPO },
      { id: 'new-push', label: 'New push', phrase: 'commits are pushed to a repository', config: GITHUB_REPO },
      { id: 'new-release', label: 'New release', phrase: 'a release is published', config: GITHUB_REPO },
      { id: 'issue-comment', label: 'New issue comment', phrase: 'a comment is added to an issue', config: GITHUB_REPO },
      { id: 'new-star', label: 'New star', phrase: 'a repository is starred', config: GITHUB_REPO }
    ]
  },
  {
    id: 'instagram', label: 'Instagram', color: '#E1306C',
    events: [
      { id: 'new-post', label: 'New post', phrase: 'a new post is published' },
      { id: 'new-story', label: 'New story', phrase: 'a new story is posted' },
      { id: 'new-comment', label: 'New comment', phrase: 'a new comment is added' },
      { id: 'new-mention', label: 'New mention', phrase: 'your account is mentioned' }
    ]
  },
  {
    id: 'metaads', label: 'Meta Ads', color: '#0866FF',
    events: [
      { id: 'new-lead', label: 'New lead', phrase: 'a new lead is captured' },
      { id: 'campaign-status', label: 'Campaign status changed', phrase: 'a campaign changes status' },
      { id: 'spend-threshold', label: 'Spend threshold reached', phrase: 'an ad account reaches its spend threshold' }
    ]
  },
  {
    id: 'googleads', label: 'Google Ads', color: '#4285F4',
    events: [
      { id: 'new-lead', label: 'New lead form submission', phrase: 'a new lead form is submitted' },
      { id: 'campaign-status', label: 'Campaign status changed', phrase: 'a campaign changes status' },
      { id: 'budget-threshold', label: 'Budget threshold reached', phrase: 'a campaign reaches its budget threshold' }
    ]
  },
  {
    id: 'googleworkspace', label: 'Google Workspace', color: '#34A853',
    events: [
      { id: 'new-file', label: 'New file in Drive', phrase: 'a new file is added to Drive', config: DRIVE_FILTERS },
      { id: 'file-updated', label: 'File updated in Drive', phrase: 'a file is updated in Drive', config: DRIVE_FILTERS },
      { id: 'new-share', label: 'File shared with you', phrase: 'a file is shared with you' },
      { id: 'new-event', label: 'New Calendar event', phrase: 'a new event is created in Calendar', config: CALENDAR_FILTERS }
    ]
  },
  {
    id: 'shopify', label: 'Shopify', color: '#95BF47',
    events: [
      { id: 'new-order', label: 'New order', phrase: 'a new order is placed' },
      { id: 'order-paid', label: 'Order paid', phrase: 'an order is paid' },
      { id: 'order-fulfilled', label: 'Order fulfilled', phrase: 'an order is fulfilled' },
      { id: 'order-cancelled', label: 'Order cancelled', phrase: 'an order is cancelled' },
      { id: 'new-customer', label: 'New customer', phrase: 'a new customer signs up' },
      { id: 'abandoned-checkout', label: 'Abandoned checkout', phrase: 'a checkout is abandoned' }
    ]
  },
  {
    id: 'rss', label: 'RSS', color: '#FF6B35',
    events: [
      { id: 'new-item', label: 'New item in feed', phrase: 'a new item appears in the feed' },
      { id: 'feed-updated', label: 'Feed updated', phrase: 'the feed is updated' }
    ]
  },
  {
    id: 'webhook', label: 'Webhook', color: '#8B5CF6',
    events: [
      { id: 'incoming', label: 'Incoming request', phrase: 'an incoming webhook request arrives' }
    ]
  }
]

/** Timer always maps to the schedule trigger instead of an app event. */
export const TIMER_TRIGGER = { id: 'timer', label: 'Timer', color: '#E6E6E6' } as const

export function triggerApp(id: string): TriggerApp | undefined {
  return TRIGGER_APPS.find((app) => app.id === id)
}

/** The catalog event a stored phrase came from, for its config fields. */
export function triggerEvent(appId: string, phrase: string): TriggerEvent | undefined {
  return triggerApp(appId)?.events.find((event) => event.phrase === phrase)
}

/** @mention the compiled prompt should use: a native tool when there is one, otherwise @composio. */
export function triggerMention(appId: string): string {
  return (TOOL_IDS as readonly string[]).includes(appId) ? appId : 'composio'
}

export function gmailEventPhrase(id: string): string {
  return GMAIL_EVENTS.find((e) => e.id === id)?.phrase ?? 'a new conversation is started'
}
