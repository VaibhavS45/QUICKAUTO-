import type { AutomationSchedule } from '../../../../shared/contracts/automations.js'
import { makeStepId, layoutPos, ORIGIN, STEP_X, NODE_H, type CanvasStep } from './canvas-steps.js'

export interface CanvasDemoTemplate {
  id: string
  title: string
  tagline: string
  badge: string
  icon: 'github' | 'code' | 'mail' | 'calendar' | 'search' | 'sheets'
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
  },
  {
    id: 'web-research-to-file',
    title: 'Web Research → File Report',
    tagline: 'Schedule → Web search → AI distills findings → Writes report to an exact file path',
    badge: 'Web Search + OpenCode + Files',
    icon: 'search',
    targetTitle: 'Web Research → File Report',
    description:
      'Runs on a schedule, searches the web for your configured topic, has the AI agent distill the results into a sourced report, then writes it as Markdown to the exact file path you set (folders are created if missing).',
    buildSteps(): CanvasStep[] {
      const schedule: AutomationSchedule = { type: 'daily', time: '09:00' }
      const row = 1 // middle row of the graph
      const pos = (index: number, line = row): { x: number; y: number } => ({
        x: ORIGIN.x + index * STEP_X,
        y: ORIGIN.y + (line - 1) * (NODE_H + 28)
      })
      return [
        {
          id: makeStepId(),
          kind: 'trigger',
          title: 'Schedule',
          subtitle: 'Runs every day at 9:00 am',
          filled: true,
          schedule,
          pos: pos(0)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Web Search',
          subtitle: 'Search the web for "<your topic>" and gather sources',
          actionPrompt:
            'Search the web for the topic configured below (e.g. "latest AI model releases"). Gather the 10 most relevant and recent results with their source URLs, publication dates, and the key facts from each.',
          config: { topic: 'e.g. latest AI model releases' },
          filled: true,
          pos: pos(1)
        },
        {
          id: makeStepId(),
          kind: 'opencode',
          title: 'OpenCode',
          subtitle: 'Distill findings into a clean, sourced written report',
          actionPrompt:
            'Distill the search results into a research report: a 5-bullet executive summary, key findings with supporting source URLs, notable quotes, and a list of anything unverified or conflicting between sources.',
          filled: true,
          pos: pos(2)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Files',
          subtitle: 'Write the report to the exact file path below',
          actionPrompt:
            'Write the final report as Markdown to this exact path: /home/<you>/Documents/research/report.md. Create any missing parent folders; if the file already exists, keep the old copy until the new report is fully written.',
          config: { path: '/home/<you>/Documents/research/report.md' },
          filled: true,
          pos: pos(3)
        }
      ]
    }
  },
  {
    id: 'github-conflict-resolver',
    title: 'GitHub Repo Conflict Resolver',
    tagline: 'Merge conflict detected → AI rewrites & re-tests branch → Pushes fix & comments on PR',
    badge: 'GitHub + OpenCode',
    icon: 'github',
    targetTitle: 'GitHub Repo Conflict Resolver',
    description:
      'Scans a repository daily for pull requests tangled in merge conflicts, fetches both sides of every conflicting hunk, lets the AI agent resolve them (preserving both intents where possible), runs the tests, then pushes the resolved branch and comments a per-conflict summary on the PR.',
    buildSteps(): CanvasStep[] {
      const schedule: AutomationSchedule = { type: 'daily', time: '09:00' }
      return [
        {
          id: makeStepId(),
          kind: 'trigger',
          title: 'GitHub',
          subtitle: 'Check for pull requests with merge conflicts (repository=owner/repo) · daily at 9:00 am',
          filled: true,
          event: 'a pull request has merge conflicts',
          config: { repository: 'owner/repo' },
          schedule,
          pos: layoutPos(0)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'GitHub',
          subtitle: 'Fetch conflicted PR, both base/head sides, and conflicting hunks',
          actionPrompt:
            'For the conflicted pull request in owner/repo: fetch the base and head branches, the list of conflicting files, and both sides of each conflicting hunk so the resolution has full context.',
          config: { repository: 'owner/repo' },
          filled: true,
          pos: layoutPos(1)
        },
        {
          id: makeStepId(),
          kind: 'opencode',
          title: 'OpenCode',
          subtitle: 'Rebase branch, resolve every hunk, and verify tests pass',
          actionPrompt:
            'Resolve the merge conflicts automatically: rebase the PR branch onto the target branch, resolve each conflicting hunk preserving both intents where possible, keep formatting consistent, and run the test suite until it passes.',
          filled: true,
          pos: layoutPos(2)
        },
        {
          id: makeStepId(),
          kind: 'action',
          title: 'GitHub',
          subtitle: 'Push resolved branch and comment how each conflict was fixed',
          actionPrompt:
            'Push the conflict-resolved commits back to the pull request branch, then post a comment on the PR summarizing how each conflict was resolved and the final test result.',
          config: { repository: 'owner/repo' },
          filled: true,
          pos: layoutPos(3)
        }
      ]
    }
  },
  {
    id: 'sheets-manual-bulk-email',
    title: 'Bulk Email Sender: Sheets or Manual List',
    tagline: 'Schedule → Google Sheets rows OR a manual list → Whole-body emails to 1–30 real people',
    badge: 'Gmail + Sheets + Schedule',
    icon: 'mail',
    targetTitle: 'Bulk Email Sender: Sheets or Manual List',
    description:
      'One schedule feeds two data sources at once: recipient rows from a Google Sheet and a manually typed list attached straight to the trigger. Each branch emails its 1–30 real recipients the full email body. Every send runs through an approval card first.',
    buildSteps(): CanvasStep[] {
      const schedule: AutomationSchedule = { type: 'daily', time: '09:00' }
      const trigger = makeStepId()
      const steps: CanvasStep[] = [
        {
          id: trigger,
          kind: 'trigger',
          title: 'Schedule',
          subtitle: 'Runs every day at 9:00 am',
          filled: true,
          schedule,
          pos: { x: ORIGIN.x, y: ORIGIN.y }
        },
        // Branch 1: recipient rows come from Google Sheets.
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Google Sheets',
          subtitle: 'Read recipients (name, email) from the sheet rows below',
          actionPrompt:
            'Read the recipient rows from the Google Sheet below (columns: name, email). Take at most 30 recipients per run and skip rows without an email address.',
          from: trigger,
          branch: 'Google Sheets',
          filled: true,
          pos: { x: ORIGIN.x + STEP_X, y: ORIGIN.y }
        },
        {
          id: makeStepId(),
          kind: 'gmail',
          title: 'Gmail',
          subtitle: 'Email each Sheets recipient the full body defined here',
          actionPrompt:
            'For each recipient read from the Google Sheet (max 30), send one email: personalized greeting with their name, and the whole email body defined here. Subject: "<Your subject>". Body: <Replace with the whole email body you want to send>.',
          from: undefined,
          filled: true,
          pos: { x: ORIGIN.x + 2 * STEP_X, y: ORIGIN.y }
        },
        // Branch 2: the recipient list typed directly on this block.
        {
          id: makeStepId(),
          kind: 'action',
          title: 'Recipients',
          subtitle: 'Manual list lives right here: replace the placeholder rows',
          actionPrompt:
            'Use this manually provided recipient list (replace it with real data — one per line, Name <email>, 1 to 30 people):\n1. First Person <first.person@example.com>\n2. Second Person <second.person@example.com>',
          from: trigger,
          branch: 'Manual list',
          filled: true,
          pos: { x: ORIGIN.x + STEP_X, y: ORIGIN.y + NODE_H + 28 }
        },
        {
          id: makeStepId(),
          kind: 'gmail',
          title: 'Gmail',
          subtitle: 'Email each listed recipient with the same whole body',
          actionPrompt:
            'For each recipient on the manual list (max 30), send one email using the full email body defined here. Subject: "<Your subject>". Body: <Replace with the whole email body you want to send>.',
          from: undefined,
          filled: true,
          pos: { x: ORIGIN.x + 2 * STEP_X, y: ORIGIN.y + NODE_H + 28 }
        }
      ]
      // Steps after the first are implicitly chained from the previous step
      // unless they declare an explicit `from`; fill the gaps explicitly so
      // the fan-out edges survive serialization.
      return steps.map((step, index, all): CanvasStep => {
        if (index > 0 && step.from === undefined) {
          return { ...step, from: all[index - 1]!.id }
        }
        return step
      })
    }
  }
]
