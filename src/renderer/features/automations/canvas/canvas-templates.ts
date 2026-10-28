import type { AutomationSchedule } from '../../../../shared/contracts/automations.js'
import { makeStepId, layoutPos, type CanvasStep } from './canvas-steps.js'

export interface CanvasDemoTemplate {
  id: string
  title: string
  tagline: string
  badge: string
  icon: 'github' | 'code' | 'mail' | 'calendar'
  description: string
  targetTitle: string
  buildSteps(): CanvasStep[]
}

export const CANVAS_DEMO_TEMPLATES: CanvasDemoTemplate[] = [
  {
    id: 'github-issue-solver',
    title: 'GitHub Issue Solver & Auto-PR',
    tagline: 'Issue opened → AI Agent solves code & runs tests → Opens PR',
    badge: 'GitHub + OpenCode',
    icon: 'github',
    targetTitle: 'GitHub Issue Solver & Auto-PR',
    description:
      'Monitors a repository for new bug issues, triggers the OpenCode AI agent to investigate the codebase, implement the fix, run tests, and open a Pull Request.',
    buildSteps(): CanvasStep[] {
      const schedule: AutomationSchedule = { type: 'daily', time: '09:00' }
      return [
        {
          id: makeStepId(),
          kind: 'trigger',
          title: 'GitHub',
          subtitle: 'When a new issue is opened (label=\'bug\') · daily at 9:00 am',
          filled: true,
          event: 'a new issue is opened',
          config: { repository: 'owner/repo', label: 'bug' },
          schedule,
          pos: layoutPos(0)
        },
        {
          id: makeStepId(),
          kind: 'opencode',
          title: 'OpenCode',
          subtitle: 'Analyze issue, implement code fix, and run test suite',
          actionPrompt:
            'Inspect the GitHub issue title, description, and error logs. Locate relevant source files in the repository, write the clean minimal bugfix, ensure all unit tests pass, and generate a clear commit message.',
          filled: true,
          pos: layoutPos(1)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'GitHub',
          subtitle: 'Create branch and pull request linking to the issue',
          actionPrompt:
            'Create a git branch (fix/issue-<number>), commit the modified files with test coverage, and open a Pull Request targeting main referencing Fixes #<issue_number>.',
          config: { repository: 'owner/repo', base: 'main' },
          filled: true,
          pos: layoutPos(2)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Slack',
          subtitle: 'Post PR link to #engineering channel',
          actionPrompt:
            'Post a notification message to Slack channel #engineering with the newly opened Pull Request URL and brief summary of the automated fix.',
          config: { channel: '#engineering' },
          filled: true,
          pos: layoutPos(3)
        }
      ]
    }
  },
  {
    id: 'github-pr-reviewer',
    title: 'GitHub PR Code Reviewer',
    tagline: 'PR opened → AI analyzes diff & security → Posts review comment',
    badge: 'GitHub + OpenCode',
    icon: 'code',
    targetTitle: 'GitHub PR Code Reviewer',
    description:
      'When a pull request is opened or updated, OpenCode analyzes the unified diff for logic bugs, security vulnerabilities, edge-case regressions, and missing tests, then posts a constructive review comment.',
    buildSteps(): CanvasStep[] {
      const schedule: AutomationSchedule = { type: 'daily', time: '09:00' }
      return [
        {
          id: makeStepId(),
          kind: 'trigger',
          title: 'GitHub',
          subtitle: 'When a new pull request is opened · daily at 9:00 am',
          filled: true,
          event: 'a new pull request is opened',
          config: { repository: 'owner/repo' },
          schedule,
          pos: layoutPos(0)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'GitHub',
          subtitle: 'Fetch PR diff, modified files, and commit logs',
          actionPrompt:
            'Fetch the pull request details, unified diff, commit history, and changed file paths for the opened PR in owner/repo.',
          config: { repository: 'owner/repo' },
          filled: true,
          pos: layoutPos(1)
        },
        {
          id: makeStepId(),
          kind: 'opencode',
          title: 'OpenCode',
          subtitle: 'Review diff for bugs, security vulnerabilities & code style',
          actionPrompt:
            'Perform a thorough code review of the PR diff: check for edge-case failures, security vulnerabilities, performance regressions, coding standards adherence, and test coverage. Format findings into clear constructive bullet points.',
          filled: true,
          pos: layoutPos(2)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'GitHub',
          subtitle: 'Post review summary and findings comment on the PR',
          actionPrompt:
            'Post the formatted review comment directly onto the Pull Request in owner/repo, highlighting key findings, potential risks, and recommended fixes.',
          config: { repository: 'owner/repo' },
          filled: true,
          pos: layoutPos(3)
        }
      ]
    }
  },
  {
    id: 'gmail-github-notion-triage',
    title: 'Urgent Bug Triage: Gmail to GitHub & Notion',
    tagline: 'Urgent email → AI triage → Creates GitHub Issue & Notion Ticket',
    badge: 'Gmail + GitHub + Notion',
    icon: 'mail',
    targetTitle: 'Urgent Bug Triage: Gmail to GitHub & Notion',
    description:
      'Monitors incoming customer or stakeholder emails for keywords like "urgent" or "crash", extracts reproduction steps, opens a tracked GitHub Issue, creates a Notion bug card, and alerts Slack.',
    buildSteps(): CanvasStep[] {
      const schedule: AutomationSchedule = { type: 'daily', time: '09:00' }
      return [
        {
          id: makeStepId(),
          kind: 'trigger',
          title: 'Gmail',
          subtitle: 'When a new email arrives (contains=\'urgent\', subject=\'bug\') · daily at 9:00 am',
          filled: true,
          event: 'a new email arrives',
          config: { contains: 'urgent', subject: 'bug' },
          schedule,
          pos: layoutPos(0)
        },
        {
          id: makeStepId(),
          kind: 'opencode',
          title: 'OpenCode',
          subtitle: 'Extract reproduction steps, system details, and priority',
          actionPrompt:
            'Analyze the customer email body: extract the software version, reproduction steps, expected vs actual behavior, error traces, and assign a priority level (P1-Critical or P2-Major).',
          filled: true,
          pos: layoutPos(1)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'GitHub',
          subtitle: 'Create tracked GitHub issue with bug label',
          actionPrompt:
            'Create a new issue in repository owner/repo with the formatted reproduction steps, system details, and label bug.',
          config: { repository: 'owner/repo', label: 'bug' },
          filled: true,
          pos: layoutPos(2)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Notion',
          subtitle: 'Create bug card in Engineering Database',
          actionPrompt:
            'Create a new database page in the Engineering Bugs Notion database linking the GitHub issue URL, reporter email, and priority level.',
          config: { database: 'Engineering Bugs' },
          filled: true,
          pos: layoutPos(3)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Slack',
          subtitle: 'Alert #oncall with priority bug report and links',
          actionPrompt:
            'Send an alert to Slack channel #oncall summarizing the urgent bug, GitHub issue URL, and Notion card link.',
          config: { channel: '#oncall' },
          filled: true,
          pos: layoutPos(4)
        }
      ]
    }
  },
  {
    id: 'daily-standup-digest',
    title: 'Daily Engineering Standup: GitHub to Notion',
    tagline: 'Daily 9 AM → Summarizes GitHub PRs & issues → Updates Notion dashboard',
    badge: 'GitHub + Notion + Schedule',
    icon: 'calendar',
    targetTitle: 'Daily Engineering Standup: GitHub to Notion',
    description:
      'Runs every weekday morning at 9:00 AM, gathers merged PRs and open blockers across repositories, synthesizes a daily standup brief, and updates the Notion engineering board.',
    buildSteps(): CanvasStep[] {
      const schedule: AutomationSchedule = { type: 'weekly', time: '09:00', weekdays: [1, 2, 3, 4, 5] }
      return [
        {
          id: makeStepId(),
          kind: 'trigger',
          title: 'Schedule',
          subtitle: 'Runs every week on Mon, Tue, Wed, Thu, Fri at 9:00 am',
          filled: true,
          schedule,
          pos: layoutPos(0)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'GitHub',
          subtitle: 'Fetch open PRs, pending reviews, and recent issue activity',
          actionPrompt:
            'Query repository owner/repo for pull requests opened or merged in the last 24 hours, pending code reviews, and newly reported issues.',
          config: { repository: 'owner/repo' },
          filled: true,
          pos: layoutPos(1)
        },
        {
          id: makeStepId(),
          kind: 'opencode',
          title: 'OpenCode',
          subtitle: 'Synthesize engineering standup digest and highlight blockers',
          actionPrompt:
            'Synthesize the GitHub activity into a concise bulleted standup update: What was shipped, what PRs need review urgently, and what blockers require discussion.',
          filled: true,
          pos: layoutPos(2)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Notion',
          subtitle: 'Update Daily Standup page in Notion workspace',
          actionPrompt:
            'Append today\'s formatted engineering standup summary to the Team Daily Standup page in Notion with date header.',
          config: { page: 'Team Daily Standup' },
          filled: true,
          pos: layoutPos(3)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Slack',
          subtitle: 'Post morning standup brief to #engineering channel',
          actionPrompt:
            'Post the formatted standup summary to Slack #engineering channel so the entire team is aligned for the day.',
          config: { channel: '#engineering' },
          filled: true,
          pos: layoutPos(4)
        }
      ]
    }
  }
]
