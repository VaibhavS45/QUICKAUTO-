import gmailLogo from '../assets/connector-logos/gmail.svg'
import googleCalendarLogo from '../assets/connector-logos/google-calendar.svg'
import instagramLogo from '../assets/connector-logos/instagram.svg'
import notionLogo from '../assets/connector-logos/notion.svg'
import outlookLogo from '../assets/connector-logos/outlook.svg'
import googleWorkspaceLogo from '../assets/connector-logos/google-workspace.svg'
import slackLogo from '../assets/connector-logos/slack.svg'
import metaAdsLogo from '../assets/connector-logos/meta-ads.svg'

// Original brand artwork vendored from Projects/logo-cdn-master
// (src/assets). Keys are the builtin connector card ids in ConnectorsTab.
export const CONNECTOR_LOGOS: Record<string, string> = {
  gmail: gmailLogo,
  calendar: googleCalendarLogo,
  instagram: instagramLogo,
  notion: notionLogo,
  outlook: outlookLogo,
  'google-workspace': googleWorkspaceLogo,
  slack: slackLogo,
  'meta-ads': metaAdsLogo
}

export function getConnectorLogo(id: string): string | undefined {
  return CONNECTOR_LOGOS[id]
}
