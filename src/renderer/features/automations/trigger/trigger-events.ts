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
  { key: 'contains', label: 'Contains word', placeholder: 'e.g. arrived, invoice, urgent' },
  { key: 'subject', label: 'Subject contains', placeholder: 'e.g. arrival, flight, meeting' },
  { key: 'from', label: 'From sender', placeholder: 'boss@company.com' },
  { key: 'labelIds', label: 'Label', placeholder: 'INBOX', options: ['INBOX', 'IMPORTANT', 'STARRED', 'UNREAD', 'CATEGORY_PERSONAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES'] },
  { key: 'query', label: 'Search query', placeholder: 'is:unread label:INBOX' }
]

const GMAIL_KEYWORD_FILTERS: TriggerConfigField[] = [
  { key: 'keyword', label: 'Search word / phrase', placeholder: 'e.g. arrived, invoice, urgent' },
  { key: 'subject', label: 'Subject contains', placeholder: 'e.g. arrival, flight, meeting' },
  { key: 'from', label: 'From sender', placeholder: 'boss@company.com' },
  { key: 'labelIds', label: 'Label', placeholder: 'INBOX', options: ['INBOX', 'IMPORTANT', 'STARRED', 'UNREAD', 'CATEGORY_PERSONAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES'] },
  { key: 'query', label: 'Search query', placeholder: 'is:unread label:INBOX' }
]

const GMAIL_ATTACHMENT_FILTERS: TriggerConfigField[] = [
  { key: 'contains', label: 'Contains word', placeholder: 'e.g. arrived, invoice' },
  { key: 'filename', label: 'Filename contains', placeholder: 'e.g. receipt.pdf, statement' },
  { key: 'from', label: 'From sender', placeholder: 'boss@company.com' },
  { key: 'subject', label: 'Subject contains', placeholder: 'e.g. invoice, attachment' },
  { key: 'labelIds', label: 'Label', placeholder: 'INBOX', options: ['INBOX', 'IMPORTANT', 'STARRED', 'UNREAD'] },
  { key: 'query', label: 'Search query', placeholder: 'has:attachment is:unread' }
]

const GMAIL_LABEL_FILTERS: TriggerConfigField[] = [
  { key: 'labelIds', label: 'Label', placeholder: 'INBOX', options: ['INBOX', 'IMPORTANT', 'STARRED', 'UNREAD', 'CATEGORY_PERSONAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES'] },
  { key: 'contains', label: 'Contains word', placeholder: 'e.g. arrived, invoice' },
  { key: 'from', label: 'From sender', placeholder: 'boss@company.com' },
  { key: 'query', label: 'Search query', placeholder: 'is:unread' }
]

const OUTLOOK_FILTERS: TriggerConfigField[] = [
  { key: 'subject_contains', label: 'Subject contains', placeholder: 'e.g. invoice, arrived' },
  { key: 'body_contains', label: 'Body contains word', placeholder: 'e.g. arrived, urgent' },
  { key: 'from_email', label: 'From sender', placeholder: 'boss@company.com' },
  { key: 'to_email', label: 'To recipient', placeholder: 'me@company.com' },
  { key: 'folder_id', label: 'Folder', placeholder: 'inbox', options: ['inbox', 'sentitems', 'archive', 'junkemail', 'drafts'] },
  { key: 'has_attachments', label: 'Attachments', placeholder: 'Any', options: ['true', 'false'] },
  { key: 'importance', label: 'Importance', placeholder: 'Any', options: ['low', 'normal', 'high'] }
]

const OUTLOOK_FOLDER_FILTERS: TriggerConfigField[] = [
  { key: 'folder_id', label: 'Target folder', placeholder: 'inbox', options: ['inbox', 'sentitems', 'archive', 'junkemail', 'drafts'] },
  { key: 'subject_contains', label: 'Subject contains', placeholder: 'e.g. invoice, urgent' },
  { key: 'from_email', label: 'From sender', placeholder: 'boss@company.com' }
]

const MAILMANUS_FILTERS: TriggerConfigField[] = [
  { key: 'contains', label: 'Contains word', placeholder: 'e.g. arrived, invoice, urgent' },
  { key: 'subject_contains', label: 'Subject contains', placeholder: 'e.g. invoice, update' },
  { key: 'from_email', label: 'From sender', placeholder: 'boss@company.com' }
]

const SLACK_CHANNEL: TriggerConfigField[] = [
  { key: 'channel_id', label: 'Channel ID / Name', placeholder: 'C0123456789 or #general' },
  { key: 'text_contains', label: 'Message contains word', placeholder: 'e.g. urgent, arrived, deploy' },
  { key: 'channel_type', label: 'Type', placeholder: 'Any', options: ['channel', 'group', 'mpim'] },
  { key: 'is_bot_message', label: 'From', placeholder: 'Anyone', options: ['false', 'true'] },
  { key: 'is_thread_reply', label: 'Thread reply', placeholder: 'Any', options: ['false', 'true'] }
]

const SLACK_MENTION: TriggerConfigField[] = [
  { key: 'channel_id', label: 'Channel ID / Name', placeholder: 'Any or #general' },
  { key: 'text_contains', label: 'Message contains word', placeholder: 'e.g. review, help, arrived' }
]

const SLACK_REACTION: TriggerConfigField[] = [
  { key: 'channel_id', label: 'Channel', placeholder: 'C0123456789' },
  { key: 'emoji_name', label: 'Emoji', placeholder: 'thumbsup' }
]

const SLACK_FILE_FILTERS: TriggerConfigField[] = [
  { key: 'channel_id', label: 'Channel ID', placeholder: 'C0123456789' },
  { key: 'filename_contains', label: 'Filename contains word', placeholder: 'e.g. report, design' }
]

const NOTION_DATABASE_FILTERS: TriggerConfigField[] = [
  { key: 'database_id', label: 'Database ID', placeholder: 'e.g. 1234abcd5678...' },
  { key: 'title_contains', label: 'Title contains word', placeholder: 'e.g. Project, Task, Arrived' },
  { key: 'parent_page_id', label: 'Parent page ID', placeholder: 'Page ID (optional)' }
]

const NOTION_PAGE_FILTERS: TriggerConfigField[] = [
  { key: 'page_id', label: 'Page ID', placeholder: 'Specific page ID (optional)' },
  { key: 'title_contains', label: 'Title contains word', placeholder: 'e.g. Task, Review' },
  { key: 'content_contains', label: 'Content contains word', placeholder: 'e.g. Complete, Done, Arrived' },
  { key: 'database_id', label: 'Database ID', placeholder: 'Database ID (optional)' }
]

const NOTION_COMMENT_FILTERS: TriggerConfigField[] = [
  { key: 'page_id', label: 'Page ID', placeholder: 'Specific page ID (optional)' },
  { key: 'comment_contains', label: 'Comment contains word', placeholder: 'e.g. approved, lgtm, question' }
]

const NOTION_ENTRY_FILTERS: TriggerConfigField[] = [
  { key: 'database_id', label: 'Database ID', placeholder: 'Database ID' },
  { key: 'property_filter', label: 'Property filter (name:value)', placeholder: 'Status:Done' },
  { key: 'title_contains', label: 'Title contains word', placeholder: 'e.g. Task, Arrived' }
]

const CALENDAR_FILTERS: TriggerConfigField[] = [
  { key: 'calendarId', label: 'Calendar', placeholder: 'primary' },
  { key: 'event_title_contains', label: 'Title contains word', placeholder: 'e.g. Meeting, Flight, Arrive' },
  { key: 'showDeleted', label: 'Include deleted', placeholder: 'false', options: ['false', 'true'] }
]

const CALENDAR_SOON_FILTERS: TriggerConfigField[] = [
  { key: 'calendarId', label: 'Calendar', placeholder: 'primary' },
  { key: 'minutesBeforeStart', label: 'Minutes before', placeholder: '10' },
  { key: 'event_title_contains', label: 'Title contains word', placeholder: 'e.g. Flight, Interview' }
]

const CALENDAR_RESPONSE_FILTERS: TriggerConfigField[] = [
  { key: 'calendarId', label: 'Calendar', placeholder: 'primary' },
  { key: 'response_status', label: 'Response status', placeholder: 'Any', options: ['accepted', 'declined', 'tentative'] },
  { key: 'event_title_contains', label: 'Title contains word', placeholder: 'e.g. Meeting' }
]

const OUTLOOK_CALENDAR_FILTERS: TriggerConfigField[] = [
  { key: 'calendar_id', label: 'Calendar', placeholder: 'default' },
  { key: 'event_title_contains', label: 'Title contains word', placeholder: 'e.g. 1:1, Demo, Sync' }
]

const OUTLOOK_CALENDAR_SOON: TriggerConfigField[] = [
  { key: 'calendar_id', label: 'Calendar', placeholder: 'default' },
  { key: 'minutes_before', label: 'Minutes before', placeholder: '15' },
  { key: 'event_title_contains', label: 'Title contains word', placeholder: 'e.g. Meeting' }
]

const DRIVE_FILTERS: TriggerConfigField[] = [
  { key: 'filename_contains', label: 'Filename contains word', placeholder: 'e.g. Report, Invoice, Q3' },
  { key: 'folder_id', label: 'Folder ID', placeholder: '1AbCdEf…' },
  { key: 'query', label: 'Search query', placeholder: "name contains 'report'" },
  { key: 'mime_type', label: 'File type', placeholder: 'Any', options: ['application/pdf', 'application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet', 'image/png'] }
]

const GITHUB_REPO: TriggerConfigField[] = [
  { key: 'owner', label: 'Owner', placeholder: 'octocat' },
  { key: 'repo', label: 'Repo', placeholder: 'hello-world' }
]

const GITHUB_ISSUE_FILTERS: TriggerConfigField[] = [
  { key: 'owner', label: 'Owner', placeholder: 'octocat' },
  { key: 'repo', label: 'Repo', placeholder: 'hello-world' },
  { key: 'title_contains', label: 'Title contains word', placeholder: 'e.g. crash, bug, urgent' },
  { key: 'labels', label: 'Labels filter', placeholder: 'bug, urgent' },
  { key: 'state', label: 'State', placeholder: 'open', options: ['open', 'closed', 'all'] }
]

const GITHUB_PR_FILTERS: TriggerConfigField[] = [
  { key: 'owner', label: 'Owner', placeholder: 'octocat' },
  { key: 'repo', label: 'Repo', placeholder: 'hello-world' },
  { key: 'title_contains', label: 'Title contains word', placeholder: 'e.g. release, fix, arrived' },
  { key: 'branch', label: 'Target branch', placeholder: 'main' },
  { key: 'state', label: 'State', placeholder: 'open', options: ['open', 'closed', 'all'] }
]

const GITHUB_COMMENT_FILTERS: TriggerConfigField[] = [
  { key: 'owner', label: 'Owner', placeholder: 'octocat' },
  { key: 'repo', label: 'Repo', placeholder: 'hello-world' },
  { key: 'comment_contains', label: 'Comment contains word', placeholder: 'e.g. /approve, lgtm' },
  { key: 'issue_number', label: 'Issue number (optional)', placeholder: '42' }
]

const GITHUB_PUSH_FILTERS: TriggerConfigField[] = [
  { key: 'owner', label: 'Owner', placeholder: 'octocat' },
  { key: 'repo', label: 'Repo', placeholder: 'hello-world' },
  { key: 'branch', label: 'Branch', placeholder: 'main' }
]

const GITHUB_RELEASE_FILTERS: TriggerConfigField[] = [
  { key: 'owner', label: 'Owner', placeholder: 'octocat' },
  { key: 'repo', label: 'Repo', placeholder: 'hello-world' },
  { key: 'tag_name', label: 'Tag name (optional)', placeholder: 'v1.0.0' }
]

const SHEETS_ROW_FILTERS: TriggerConfigField[] = [
  { key: 'spreadsheet_id', label: 'Spreadsheet ID', placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
  { key: 'query', label: 'Cell contains word', placeholder: 'e.g. TOTAL, Urgent, Arrived, Done' },
  { key: 'sheet_name', label: 'Sheet name / tab', placeholder: 'Sheet1' },
  { key: 'range', label: 'Range (optional)', placeholder: 'Sheet1!A1:Z50' }
]

const SHEETS_ID_FILTERS: TriggerConfigField[] = [
  { key: 'spreadsheet_id', label: 'Spreadsheet ID', placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' }
]

const SHOPIFY_ORDER_FILTERS: TriggerConfigField[] = [
  { key: 'order_name_contains', label: 'Item/Order contains word', placeholder: 'e.g. Subscription, VIP' },
  { key: 'min_total_price', label: 'Min order total ($)', placeholder: '100' },
  { key: 'currency', label: 'Currency', placeholder: 'USD', options: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] },
  { key: 'customer_email', label: 'Customer email contains', placeholder: 'vip@client.com' }
]

const SHOPIFY_FULFILL_FILTERS: TriggerConfigField[] = [
  { key: 'order_number', label: 'Order number', placeholder: '1001' },
  { key: 'customer_email', label: 'Customer email', placeholder: 'buyer@example.com' }
]

const SHOPIFY_CANCEL_FILTERS: TriggerConfigField[] = [
  { key: 'reason', label: 'Reason contains word', placeholder: 'customer, fraud, inventory' }
]

const SHOPIFY_CUSTOMER_FILTERS: TriggerConfigField[] = [
  { key: 'customer_email', label: 'Email domain / contains', placeholder: 'company.com' }
]

const SHOPIFY_CHECKOUT_FILTERS: TriggerConfigField[] = [
  { key: 'min_total_price', label: 'Min cart total ($)', placeholder: '50' }
]

const INSTAGRAM_POST_FILTERS: TriggerConfigField[] = [
  { key: 'caption_contains', label: 'Caption contains word', placeholder: 'e.g. giveaway, launch, arrived' }
]

const INSTAGRAM_COMMENT_FILTERS: TriggerConfigField[] = [
  { key: 'comment_contains', label: 'Comment contains word', placeholder: 'e.g. price, order, link' }
]

const INSTAGRAM_MENTION_FILTERS: TriggerConfigField[] = [
  { key: 'mention_contains', label: 'Mention contains word', placeholder: 'e.g. collab, review, arrived' }
]

const METAADS_LEAD_FILTERS: TriggerConfigField[] = [
  { key: 'campaign_name_contains', label: 'Campaign contains word', placeholder: 'e.g. Retargeting, Leads' },
  { key: 'ad_account_id', label: 'Ad account ID', placeholder: 'act_123456789' }
]

const METAADS_STATUS_FILTERS: TriggerConfigField[] = [
  { key: 'campaign_name_contains', label: 'Campaign contains word', placeholder: 'e.g. Retargeting' },
  { key: 'status', label: 'Status', placeholder: 'Any', options: ['ACTIVE', 'PAUSED', 'ARCHIVED'] }
]

const METAADS_SPEND_FILTERS: TriggerConfigField[] = [
  { key: 'ad_account_id', label: 'Ad account ID', placeholder: 'act_123456789' },
  { key: 'spend_threshold', label: 'Spend threshold ($)', placeholder: '500' }
]

const GOOGLEADS_LEAD_FILTERS: TriggerConfigField[] = [
  { key: 'campaign_name_contains', label: 'Campaign contains word', placeholder: 'e.g. Search, Brand' },
  { key: 'customer_id', label: 'Customer ID', placeholder: '123-456-7890' }
]

const GOOGLEADS_STATUS_FILTERS: TriggerConfigField[] = [
  { key: 'campaign_name_contains', label: 'Campaign contains word', placeholder: 'e.g. Search' },
  { key: 'status', label: 'Status', placeholder: 'Any', options: ['ENABLED', 'PAUSED', 'REMOVED'] }
]

const GOOGLEADS_BUDGET_FILTERS: TriggerConfigField[] = [
  { key: 'campaign_name_contains', label: 'Campaign contains word', placeholder: 'e.g. Search' },
  { key: 'budget_threshold', label: 'Budget threshold ($)', placeholder: '500' }
]

const RSS_ITEM_FILTERS: TriggerConfigField[] = [
  { key: 'feed_url', label: 'Feed URL', placeholder: 'https://example.com/feed.xml' },
  { key: 'title_contains', label: 'Title / Content contains word', placeholder: 'e.g. AI, Breaking, Arrived' }
]

const RSS_FEED_FILTERS: TriggerConfigField[] = [
  { key: 'feed_url', label: 'Feed URL', placeholder: 'https://example.com/feed.xml' }
]

const WEBHOOK_FILTERS: TriggerConfigField[] = [
  { key: 'path', label: 'Webhook path', placeholder: '/incoming-lead' },
  { key: 'payload_contains', label: 'Payload contains word/key', placeholder: 'e.g. status:success, arrived' }
]

export const GMAIL_EVENTS: TriggerEvent[] = [
  { id: 'new-email', label: 'New email', phrase: 'a new email is received', config: GMAIL_FILTERS },
  { id: 'new-attachment', label: 'New attachment', phrase: 'an attachment is received', config: GMAIL_ATTACHMENT_FILTERS },
  { id: 'new-conversation', label: 'New conversation', phrase: 'a new conversation is started', config: GMAIL_FILTERS },
  { id: 'keyword-search', label: 'New email matching keyword search', phrase: 'a new email matching your keyword search is received', config: GMAIL_KEYWORD_FILTERS },
  { id: 'labeled-conversation', label: 'Newly labeled conversation', phrase: 'a conversation is newly labeled', config: GMAIL_LABEL_FILTERS },
  { id: 'labeled-email', label: 'Newly labeled email or reply', phrase: 'an email or reply is newly labeled', config: GMAIL_LABEL_FILTERS },
  { id: 'starred-email', label: 'Newly starred email', phrase: 'an email is newly starred', config: GMAIL_FILTERS },
  { id: 'new-label', label: 'New label', phrase: 'a new label is created', config: [{ key: 'name_contains', label: 'Label name contains', placeholder: 'e.g. Projects' }] }
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
      { id: 'flagged-email', label: 'Newly flagged email', phrase: 'an email is newly flagged', config: OUTLOOK_FILTERS },
      { id: 'moved-email', label: 'Email moved to a folder', phrase: 'an email is moved to a folder', config: OUTLOOK_FOLDER_FILTERS }
    ]
  },
  {
    id: 'mailmanus', label: 'Mail Manus', color: '#8B5CF6',
    events: [
      { id: 'new-email', label: 'New email', phrase: 'a new email arrives', config: MAILMANUS_FILTERS },
      { id: 'new-reply', label: 'New reply', phrase: 'a reply is received', config: MAILMANUS_FILTERS }
    ]
  },
  {
    id: 'slack', label: 'Slack', color: '#611F69',
    events: [
      { id: 'new-message', label: 'New message in a channel', phrase: 'a new message is posted in a channel', config: SLACK_CHANNEL },
      { id: 'new-mention', label: 'New mention', phrase: 'you are mentioned in a message', config: SLACK_MENTION },
      { id: 'new-reaction', label: 'New reaction', phrase: 'a message gets a new reaction', config: SLACK_REACTION },
      { id: 'new-file', label: 'New file shared', phrase: 'a file is shared', config: SLACK_FILE_FILTERS },
      { id: 'new-member', label: 'New member joins', phrase: 'a member joins the workspace', config: [{ key: 'channel_id', label: 'Channel ID (optional)', placeholder: 'C0123456789' }] },
      { id: 'new-channel', label: 'New channel created', phrase: 'a channel is created', config: [{ key: 'name_contains', label: 'Channel name contains', placeholder: 'e.g. project-' }] }
    ]
  },
  {
    id: 'notion', label: 'Notion', color: '#E8E8E8',
    events: [
      { id: 'new-page', label: 'New page in a database', phrase: 'a new page is added to a database', config: NOTION_DATABASE_FILTERS },
      { id: 'page-updated', label: 'Page updated', phrase: 'a page is updated', config: NOTION_PAGE_FILTERS },
      { id: 'new-comment', label: 'New comment', phrase: 'a new comment is added', config: NOTION_COMMENT_FILTERS },
      { id: 'new-entry', label: 'New database entry', phrase: 'a new database entry is created', config: NOTION_ENTRY_FILTERS }
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
        config: CALENDAR_SOON_FILTERS
      },
      { id: 'attendee-response', label: 'Attendee response', phrase: 'an attendee responds to an invite', config: CALENDAR_RESPONSE_FILTERS }
    ]
  },
  {
    id: 'outlookcalendar', label: 'Outlook Calendar', color: '#0F6CBD',
    events: [
      { id: 'new-event', label: 'New event', phrase: 'a new event is created', config: OUTLOOK_CALENDAR_FILTERS },
      { id: 'updated-event', label: 'Event updated', phrase: 'an event is updated', config: OUTLOOK_CALENDAR_FILTERS },
      { id: 'cancelled-event', label: 'Event cancelled', phrase: 'an event is cancelled', config: OUTLOOK_CALENDAR_FILTERS },
      { id: 'starting-event', label: 'Event starting soon', phrase: 'an event is about to start', config: OUTLOOK_CALENDAR_SOON }
    ]
  },
  {
    id: 'github', label: 'GitHub', color: '#6E7681',
    events: [
      { id: 'new-issue', label: 'New issue', phrase: 'a new issue is opened', config: GITHUB_ISSUE_FILTERS },
      { id: 'new-pr', label: 'New pull request', phrase: 'a new pull request is opened', config: GITHUB_PR_FILTERS },
      { id: 'new-push', label: 'New push', phrase: 'commits are pushed to a repository', config: GITHUB_PUSH_FILTERS },
      { id: 'new-release', label: 'New release', phrase: 'a release is published', config: GITHUB_RELEASE_FILTERS },
      { id: 'issue-comment', label: 'New issue comment', phrase: 'a comment is added to an issue', config: GITHUB_COMMENT_FILTERS },
      { id: 'new-star', label: 'New star', phrase: 'a repository is starred', config: GITHUB_REPO }
    ]
  },
  {
    id: 'sheets', label: 'Google Sheets', color: '#0F9D58',
    events: [
      { id: 'row-added', label: 'New row added to sheet', phrase: 'a new row is added to a spreadsheet', config: SHEETS_ROW_FILTERS },
      { id: 'row-changed', label: 'Row or cell value changed', phrase: 'a row or cell value changes in a spreadsheet', config: SHEETS_ROW_FILTERS },
      { id: 'search-match', label: 'Row matches search query', phrase: 'a row matching your search query is found', config: SHEETS_ROW_FILTERS },
      { id: 'sheet-created', label: 'New worksheet created', phrase: 'a new worksheet is created in a spreadsheet', config: SHEETS_ID_FILTERS }
    ]
  },
  {
    id: 'instagram', label: 'Instagram', color: '#E1306C',
    events: [
      { id: 'new-post', label: 'New post', phrase: 'a new post is published', config: INSTAGRAM_POST_FILTERS },
      { id: 'new-story', label: 'New story', phrase: 'a new story is posted', config: INSTAGRAM_POST_FILTERS },
      { id: 'new-comment', label: 'New comment', phrase: 'a new comment is added', config: INSTAGRAM_COMMENT_FILTERS },
      { id: 'new-mention', label: 'New mention', phrase: 'your account is mentioned', config: INSTAGRAM_MENTION_FILTERS }
    ]
  },
  {
    id: 'metaads', label: 'Meta Ads', color: '#0866FF',
    events: [
      { id: 'new-lead', label: 'New lead', phrase: 'a new lead is captured', config: METAADS_LEAD_FILTERS },
      { id: 'campaign-status', label: 'Campaign status changed', phrase: 'a campaign changes status', config: METAADS_STATUS_FILTERS },
      { id: 'spend-threshold', label: 'Spend threshold reached', phrase: 'an ad account reaches its spend threshold', config: METAADS_SPEND_FILTERS }
    ]
  },
  {
    id: 'googleads', label: 'Google Ads', color: '#4285F4',
    events: [
      { id: 'new-lead', label: 'New lead form submission', phrase: 'a new lead form is submitted', config: GOOGLEADS_LEAD_FILTERS },
      { id: 'campaign-status', label: 'Campaign status changed', phrase: 'a campaign changes status', config: GOOGLEADS_STATUS_FILTERS },
      { id: 'budget-threshold', label: 'Budget threshold reached', phrase: 'a campaign reaches its budget threshold', config: GOOGLEADS_BUDGET_FILTERS }
    ]
  },
  {
    id: 'googleworkspace', label: 'Google Workspace', color: '#34A853',
    events: [
      { id: 'new-file', label: 'New file in Drive', phrase: 'a new file is added to Drive', config: DRIVE_FILTERS },
      { id: 'file-updated', label: 'File updated in Drive', phrase: 'a file is updated in Drive', config: DRIVE_FILTERS },
      { id: 'new-share', label: 'File shared with you', phrase: 'a file is shared with you', config: [{ key: 'filename_contains', label: 'Filename contains word', placeholder: 'e.g. Presentation, Budget' }] },
      { id: 'new-event', label: 'New Calendar event', phrase: 'a new event is created in Calendar', config: CALENDAR_FILTERS }
    ]
  },
  {
    id: 'shopify', label: 'Shopify', color: '#95BF47',
    events: [
      { id: 'new-order', label: 'New order', phrase: 'a new order is placed', config: SHOPIFY_ORDER_FILTERS },
      { id: 'order-paid', label: 'Order paid', phrase: 'an order is paid', config: SHOPIFY_ORDER_FILTERS },
      { id: 'order-fulfilled', label: 'Order fulfilled', phrase: 'an order is fulfilled', config: SHOPIFY_FULFILL_FILTERS },
      { id: 'order-cancelled', label: 'Order cancelled', phrase: 'an order is cancelled', config: SHOPIFY_CANCEL_FILTERS },
      { id: 'new-customer', label: 'New customer', phrase: 'a new customer signs up', config: SHOPIFY_CUSTOMER_FILTERS },
      { id: 'abandoned-checkout', label: 'Abandoned checkout', phrase: 'a checkout is abandoned', config: SHOPIFY_CHECKOUT_FILTERS }
    ]
  },
  {
    id: 'rss', label: 'RSS', color: '#FF6B35',
    events: [
      { id: 'new-item', label: 'New item in feed', phrase: 'a new item appears in the feed', config: RSS_ITEM_FILTERS },
      { id: 'feed-updated', label: 'Feed updated', phrase: 'the feed is updated', config: RSS_FEED_FILTERS }
    ]
  },
  {
    id: 'webhook', label: 'Webhook', color: '#8B5CF6',
    events: [
      { id: 'incoming', label: 'Incoming request', phrase: 'an incoming webhook request arrives', config: WEBHOOK_FILTERS }
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

const NATIVE_TRIGGER_APPS: readonly string[] = ['gmail', 'notion', 'sheets', 'github']

/** @mention the compiled prompt should use: a native tool when there is one, otherwise @composio. */
export function triggerMention(appId: string): string {
  return NATIVE_TRIGGER_APPS.includes(appId) ? appId : 'composio'
}

export function gmailEventPhrase(id: string): string {
  return GMAIL_EVENTS.find((e) => e.id === id)?.phrase ?? 'a new conversation is started'
}
