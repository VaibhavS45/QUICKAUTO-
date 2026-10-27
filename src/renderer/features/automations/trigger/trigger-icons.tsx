import { Clock, Mail, Webhook } from 'lucide-react'
import gmailLogo from '../../../assets/connector-logos/gmail.svg'
import googleCalendarLogo from '../../../assets/connector-logos/google-calendar.svg'
import googleWorkspaceLogo from '../../../assets/connector-logos/google-workspace.svg'
import instagramLogo from '../../../assets/connector-logos/instagram.svg'
import outlookLogo from '../../../assets/connector-logos/outlook.svg'
import slackLogo from '../../../assets/connector-logos/slack.svg'
import githubLogo from './logos/github.svg'
import googleAdsLogo from './logos/google-ads.svg'
import metaAdsLogo from './logos/meta-ads.svg'
import notionLogo from './logos/notion.svg'
import rssLogo from './logos/rss.svg'
import shopifyLogo from './logos/shopify.svg'

/** Official brand artwork per trigger app. Generic connectors fall back to a line icon. */
const LOGOS: Record<string, string> = {
  gmail: gmailLogo,
  outlook: outlookLogo,
  outlookcalendar: outlookLogo,
  slack: slackLogo,
  notion: notionLogo,
  googlecalendar: googleCalendarLogo,
  github: githubLogo,
  instagram: instagramLogo,
  metaads: metaAdsLogo,
  googleads: googleAdsLogo,
  googleworkspace: googleWorkspaceLogo,
  shopify: shopifyLogo,
  rss: rssLogo
}

const NEUTRAL: Record<string, typeof Mail> = {
  mailmanus: Mail,
  webhook: Webhook,
  timer: Clock
}

export function hasTriggerIcon(id: string): boolean {
  return id in LOGOS || id in NEUTRAL
}

export function TriggerAppIcon({ app, size = 26 }: {
  app: { id: string; color: string }
  size?: number
}): React.JSX.Element {
  const src = LOGOS[app.id]
  if (src) {
    return <img src={src} width={size} height={size} alt="" aria-hidden="true" style={{ objectFit: 'contain' }} />
  }
  const Icon = NEUTRAL[app.id] ?? Mail
  return <Icon size={size} color={app.color} strokeWidth={1.75} aria-hidden="true" />
}
