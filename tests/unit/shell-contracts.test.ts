import { describe, expect, it } from 'vitest'
import {
  AutomationDefaultsSchema,
  AutomationTemplateSchema
} from '../../src/shared/contracts/automation-templates.js'
import {
  AppNotificationSchema,
  NotificationKindSchema
} from '../../src/shared/contracts/notifications.js'
import {
  RunRecordSchema,
  ScheduleItemSchema,
  TodayScheduleSchema
} from '../../src/shared/contracts/schedule.js'

describe('shell shared schemas', () => {
  it('accepts valid schedule and run records and strips additive fields', () => {
    const item = {
      id: 'schedule-1',
      title: 'Research',
      kind: 'schedule',
      at: 1_800_000_000_000,
      status: 'upcoming',
      toolIds: ['websearch'],
      futureField: 'ignored'
    }
    expect(ScheduleItemSchema.safeParse(item).success).toBe(true)
    expect(ScheduleItemSchema.parse(item)).not.toHaveProperty('futureField')
    expect(RunRecordSchema.safeParse({
      id: 'run-1',
      title: 'Research',
      startedAt: 1_800_000_000_000,
      status: 'succeeded',
      futureField: true
    }).success).toBe(true)
    expect(ScheduleItemSchema.safeParse({ ...item, status: 'unknown' }).success).toBe(false)
  })

  it('validates today schedule dates and counts', () => {
    expect(TodayScheduleSchema.safeParse({ date: '2026-10-10', items: [], done: 0, remaining: 0 }).success).toBe(true)
    expect(TodayScheduleSchema.safeParse({ date: '2026-13-40', items: [], done: 0, remaining: 0 }).success).toBe(false)
    expect(TodayScheduleSchema.safeParse({ date: '2026-10-10', items: [], done: -1, remaining: 0 }).success).toBe(false)
  })

  it('accepts notification kinds and notifications while rejecting malformed payloads', () => {
    const notification = {
      id: 'notice-1',
      kind: 'info',
      title: 'Ready',
      createdAt: 1_800_000_000_000,
      read: false,
      futureField: 'ignored'
    }
    expect(NotificationKindSchema.safeParse('approval-needed').success).toBe(true)
    expect(AppNotificationSchema.safeParse(notification).success).toBe(true)
    expect(AppNotificationSchema.parse(notification)).not.toHaveProperty('futureField')
    expect(AppNotificationSchema.safeParse({ ...notification, kind: 'unknown' }).success).toBe(false)
  })

  it('validates templates and automation defaults with forward-compatible objects', () => {
    const template = {
      id: 'repo-watcher',
      title: 'Repo watcher',
      description: 'Review PRs.',
      trigger: { kind: 'schedule', at: '18:00', extra: 'ignored' },
      prompt: 'Review open PRs.',
      toolIds: ['github'],
      inputs: [{ key: 'repo', label: 'Repository', type: 'text', extra: true }],
      requires: ['github'],
      extra: true
    }
    expect(AutomationTemplateSchema.safeParse(template).success).toBe(true)
    expect(AutomationTemplateSchema.safeParse({ ...template, trigger: { kind: 'unknown' } }).success).toBe(false)
    expect(AutomationDefaultsSchema.safeParse({
      approvalPolicy: 'ask',
      missedRunPolicy: 'skip',
      notifyOnComplete: true,
      extra: true
    }).success).toBe(true)
    expect(AutomationDefaultsSchema.safeParse({
      approvalPolicy: 'automatic',
      missedRunPolicy: 'skip',
      notifyOnComplete: true
    }).success).toBe(false)
  })
})
