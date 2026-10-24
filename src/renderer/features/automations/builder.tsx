import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOOL_IDS, TOOL_META, type ActiveToolId } from '../../../shared/types.js'
import { TIMER_TRIGGER, TRIGGER_APPS, triggerApp, triggerEvent, triggerMention } from './trigger-events.js'
import { TriggerAppIcon } from './trigger-icons.js'
import { blankTrigger, draftToAutomation, makeTriggerId, type BuilderDraft, type BuilderRepeat, type BuilderTrigger } from './builder-compile.js'
import { attachmentPromptText, needsComposioTools, useAttachments } from '../../lib/attachments.js'
import type { AutomationCreate } from '../../../shared/contracts/automations.js'
import type { RunRecord } from '../../../shared/contracts/schedule.js'
import type { DriveFile } from '../../../main/connectors/drive.js'
import type { AgentProfile } from '../../../main/agent/agent-store.js'
import { ConnectorPicker } from './ConnectorPicker.js'
import BuilderConnectorPopover from './BuilderConnectorPopover.js'
import './automations.css'
import './builder-opencode.css'
import './scheduled.css'

interface BuilderProps {
  initial: BuilderDraft
  gmailConnected: boolean | undefined
  onConnect(): void
  onClose(): void
  /** Resolves with an error message, or null on success. */
  onSubmit(create: AutomationCreate): Promise<string | null>
}

const REPEATS: { value: BuilderRepeat; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'once', label: 'Once' }
]

const REPEAT_OPTIONS = REPEATS

const HOURS_LIST = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const MINUTES_LIST = ['00', '15', '30', '45']

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Half-hour slots labeled like "AM 9:00" (screenshot spec), valued as 24h HH:MM. */
function TrashIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 4h11M6.5 4V2.8c0-.4.4-.8.8-.8h1.4c.4 0 .8.4.8.8V4M4 4l.7 9.2c0 .4.4.8.8.8h5c.4 0 .8-.4.8-.8L12 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PaperCloseIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M11.575 3.575C11.81 3.341 12.19 3.341 12.424 3.575C12.659 3.81 12.659 4.19 12.424 4.424L8.849 8L12.424 11.575C12.659 11.81 12.659 12.19 12.424 12.424C12.19 12.659 11.81 12.659 11.575 12.424L8 8.849L4.424 12.424C4.19 12.659 3.81 12.659 3.575 12.424C3.341 12.19 3.341 11.81 3.575 11.575L7.151 8L3.575 4.424C3.341 4.19 3.341 3.81 3.575 3.575C3.81 3.341 4.19 3.341 4.424 3.575L8 7.151L11.575 3.575Z" fill="#B3B3B3" />
    </svg>
  )
}

function PaperClockIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M8 3.4C8.331 3.4 8.6 3.669 8.6 4V7.63L10.935 8.797C11.231 8.945 11.351 9.305 11.203 9.602C11.055 9.898 10.695 10.018 10.398 9.87L7.732 8.536C7.529 8.435 7.4 8.227 7.4 8V4C7.4 3.669 7.669 3.4 8 3.4Z" fill="#E6E6E6" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8 0.733C12.013 0.733 15.267 3.987 15.267 8C15.267 12.013 12.013 15.267 8 15.267C3.987 15.267 0.733 12.013 0.733 8C0.733 3.987 3.987 0.733 8 0.733ZM8 1.934C4.649 1.934 1.934 4.649 1.934 8C1.934 11.351 4.649 14.066 8 14.066C11.351 14.066 14.066 11.351 14.066 8C14.066 4.649 11.351 1.934 8 1.934Z" fill="#E6E6E6" />
    </svg>
  )
}

function PaperChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M11.575 5.576C11.81 5.341 12.19 5.341 12.424 5.576C12.659 5.81 12.659 6.19 12.424 6.424L8.424 10.425C8.19 10.659 7.81 10.659 7.575 10.425L3.575 6.424C3.341 6.19 3.341 5.81 3.575 5.576C3.81 5.341 4.19 5.341 4.424 5.576L8 9.151L11.575 5.576Z" fill="#8C8C8C" />
    </svg>
  )
}

function PaperPlusIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" fill="none" stroke="#B3B3B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 5v14" fill="none" stroke="#B3B3B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PaperSlidersIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 17H5" fill="none" stroke="#B3B3B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 7h-9" fill="none" stroke="#B3B3B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="17" r="3" fill="none" stroke="#B3B3B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="3" fill="none" stroke="#B3B3B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MenuChevronIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" fill="none" stroke="#8C8C8C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusLocalIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusCreationsIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M13.773 4.568L4.909 13.091" fill="none" stroke="#E6E6E6" strokeWidth="1.35" />
      <circle cx="5.25" cy="5.25" r="2.813" fill="none" stroke="#E6E6E6" strokeWidth="1.238" />
      <circle cx="3.545" cy="14.046" r="2.045" fill="#E6E6E6" />
      <circle cx="14.455" cy="3.545" r="2.045" fill="#E6E6E6" />
      <rect x="10.5" y="10.5" width="5.25" height="5.25" rx="0.75" fill="none" stroke="#E6E6E6" strokeWidth="1.299" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusLibraryIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="8" height="18" x="3" y="3" rx="1" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 3v18" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusRecentIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M14 2.667C14.368 2.667 14.667 2.965 14.667 3.333C14.667 3.702 14.368 4 14 4H8.667C8.298 4 8 3.702 8 3.333C8 2.965 8.298 2.667 8.667 2.667H14Z" fill="#E6E6E6" />
      <path d="M14 7.333C14.368 7.333 14.667 7.632 14.667 8C14.667 8.368 14.368 8.667 14 8.667H8.667C8.298 8.667 8 8.368 8 8C8 7.632 8.298 7.333 8.667 7.333H14Z" fill="#E6E6E6" />
      <path d="M14 12C14.368 12 14.667 12.299 14.667 12.667C14.667 13.035 14.368 13.333 14 13.333H8.667C8.298 13.333 8 13.035 8 12.667C8 12.299 8.298 12 8.667 12H14Z" fill="#E6E6E6" />
      <path d="M5.529 9.529C5.789 9.268 6.211 9.268 6.471 9.529C6.732 9.789 6.732 10.211 6.471 10.471L3.805 13.138C3.544 13.398 3.122 13.398 2.862 13.138L1.529 11.805C1.268 11.544 1.268 11.122 1.529 10.862C1.789 10.602 2.211 10.602 2.471 10.862L3.333 11.724L5.529 9.529Z" fill="#E6E6E6" />
      <path d="M2.667 3.333V6H5.333V3.333H2.667ZM6.667 6C6.667 6.736 6.07 7.333 5.333 7.333H2.667C1.93 7.333 1.333 6.736 1.333 6V3.333C1.333 2.597 1.93 2 2.667 2H5.333C6.07 2 6.667 2.597 6.667 3.333V6Z" fill="#E6E6E6" />
    </svg>
  )
}

function PlusSkillsIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.399 12.032C14.969 11.883 15.568 11.89 16.134 12.05C16.701 12.209 17.215 12.517 17.624 12.941C18.002 13.334 18.274 13.814 18.422 14.338L19.888 12.872C20.003 12.757 20.093 12.621 20.155 12.471C20.217 12.322 20.249 12.162 20.249 12C20.249 11.838 20.217 11.678 20.155 11.528C20.093 11.379 20.003 11.243 19.888 11.129L18.332 9.573C18.09 9.331 17.916 9.029 17.83 8.698C17.743 8.367 17.747 8.018 17.84 7.688L17.879 7.566C17.979 7.285 18.142 7.03 18.358 6.823L18.454 6.737C18.682 6.545 18.953 6.408 19.244 6.339C19.47 6.284 19.678 6.171 19.846 6.009C20.014 5.848 20.137 5.644 20.2 5.42C20.263 5.195 20.266 4.958 20.208 4.732C20.149 4.507 20.031 4.3 19.866 4.135C19.701 3.971 19.495 3.853 19.269 3.794C19.044 3.735 18.806 3.736 18.582 3.8C18.357 3.863 18.154 3.985 17.992 4.153C17.83 4.321 17.716 4.53 17.662 4.757C17.582 5.089 17.414 5.395 17.177 5.641C16.94 5.888 16.642 6.067 16.312 6.16C15.983 6.253 15.635 6.256 15.303 6.17C14.972 6.083 14.67 5.911 14.428 5.669L12.872 4.112C12.757 3.998 12.621 3.906 12.471 3.844C12.322 3.783 12.162 3.751 12 3.751C11.838 3.751 11.678 3.783 11.528 3.844C11.378 3.906 11.242 3.998 11.128 4.112L9.662 5.576C10.185 5.723 10.665 5.997 11.058 6.375C11.483 6.783 11.791 7.296 11.951 7.863C12.111 8.43 12.117 9.029 11.968 9.598C11.82 10.168 11.522 10.688 11.106 11.104C10.69 11.521 10.17 11.819 9.6 11.967C9.031 12.116 8.432 12.111 7.865 11.951C7.298 11.791 6.784 11.484 6.376 11.059C5.998 10.666 5.725 10.185 5.577 9.662L4.111 11.129C3.997 11.243 3.906 11.379 3.844 11.528C3.782 11.678 3.751 11.838 3.751 12C3.751 12.162 3.782 12.322 3.844 12.471C3.906 12.621 3.997 12.757 4.111 12.872L5.668 14.428C5.91 14.669 6.083 14.971 6.17 15.303C6.256 15.634 6.253 15.982 6.16 16.311C6.067 16.641 5.888 16.94 5.641 17.177C5.425 17.385 5.164 17.538 4.879 17.627L4.755 17.661C4.529 17.715 4.321 17.829 4.153 17.991C3.985 18.153 3.863 18.356 3.799 18.581C3.736 18.805 3.733 19.043 3.792 19.268C3.85 19.494 3.969 19.7 4.133 19.865C4.298 20.03 4.505 20.148 4.73 20.207C4.956 20.266 5.193 20.263 5.418 20.2C5.642 20.137 5.846 20.015 6.007 19.846C6.169 19.678 6.283 19.471 6.338 19.244L6.372 19.121C6.46 18.836 6.614 18.575 6.822 18.359L6.914 18.269C7.134 18.068 7.399 17.921 7.687 17.84L7.811 17.809C8.103 17.747 8.406 17.754 8.696 17.83C9.027 17.916 9.33 18.09 9.572 18.332L11.128 19.888C11.242 20.003 11.378 20.093 11.528 20.155C11.678 20.217 11.838 20.25 12 20.25C12.162 20.25 12.322 20.217 12.471 20.155C12.621 20.093 12.757 20.003 12.872 19.888L14.337 18.424C13.814 18.276 13.334 18.003 12.941 17.626C12.517 17.218 12.208 16.703 12.049 16.136C11.889 15.57 11.882 14.971 12.031 14.401C12.18 13.832 12.477 13.312 12.893 12.895C13.309 12.479 13.829 12.181 14.399 12.032ZM22.249 12C22.249 12.424 22.165 12.845 22.003 13.237C21.84 13.629 21.602 13.986 21.302 14.286L19.746 15.842C19.504 16.085 19.202 16.258 18.871 16.344C18.54 16.431 18.191 16.428 17.861 16.335C17.532 16.242 17.233 16.062 16.996 15.815C16.759 15.568 16.592 15.263 16.512 14.93L16.461 14.764C16.398 14.602 16.303 14.454 16.182 14.328C16.021 14.16 15.817 14.038 15.592 13.974C15.368 13.911 15.13 13.909 14.905 13.967C14.679 14.026 14.473 14.144 14.308 14.309C14.143 14.474 14.025 14.68 13.966 14.906C13.908 15.132 13.91 15.369 13.973 15.594C14.037 15.818 14.159 16.022 14.327 16.183C14.495 16.345 14.704 16.459 14.93 16.513C15.221 16.583 15.491 16.72 15.719 16.912L15.815 16.997L15.904 17.089C16.076 17.278 16.21 17.5 16.296 17.741L16.334 17.863L16.365 17.987C16.427 18.279 16.42 18.582 16.344 18.872C16.258 19.203 16.084 19.505 15.842 19.747L14.286 21.302C13.986 21.603 13.629 21.841 13.237 22.004C12.845 22.166 12.424 22.25 12 22.25C11.575 22.25 11.155 22.166 10.762 22.004C10.37 21.841 10.014 21.603 9.714 21.302L8.248 19.837C8.1 20.36 7.827 20.84 7.449 21.233C7.041 21.657 6.527 21.965 5.961 22.125C5.394 22.285 4.795 22.29 4.225 22.141C3.656 21.993 3.136 21.695 2.719 21.279C2.303 20.863 2.006 20.343 1.857 19.773C1.708 19.203 1.715 18.604 1.875 18.037C2.035 17.47 2.342 16.956 2.766 16.549C3.159 16.171 3.639 15.897 4.163 15.75L2.698 14.286C2.397 13.986 2.159 13.629 1.997 13.237C1.834 12.845 1.751 12.424 1.751 12C1.751 11.575 1.834 11.155 1.997 10.762C2.159 10.37 2.397 10.014 2.697 9.714L4.254 8.157C4.495 7.915 4.798 7.742 5.129 7.656L5.254 7.628C5.505 7.58 5.763 7.582 6.013 7.634L6.138 7.666L6.26 7.705C6.501 7.79 6.723 7.923 6.912 8.095L7.004 8.184L7.089 8.28C7.281 8.508 7.417 8.778 7.487 9.069C7.541 9.296 7.655 9.504 7.817 9.673C7.979 9.841 8.182 9.963 8.407 10.026C8.631 10.089 8.869 10.092 9.094 10.033C9.32 9.974 9.526 9.855 9.691 9.69C9.856 9.525 9.974 9.319 10.033 9.093C10.092 8.868 10.089 8.63 10.026 8.406C9.963 8.182 9.84 7.979 9.672 7.817C9.504 7.655 9.296 7.541 9.069 7.487C8.736 7.406 8.431 7.24 8.184 7.003C7.937 6.766 7.759 6.467 7.666 6.137C7.573 5.808 7.569 5.46 7.655 5.129L7.692 5.006C7.786 4.723 7.945 4.464 8.157 4.253L9.714 2.697C10.014 2.398 10.37 2.159 10.762 1.997C11.155 1.834 11.575 1.751 12 1.751C12.424 1.751 12.845 1.834 13.237 1.997C13.629 2.159 13.986 2.398 14.286 2.698L15.751 4.163C15.898 3.64 16.173 3.16 16.55 2.767C16.959 2.343 17.472 2.034 18.039 1.875C18.605 1.715 19.204 1.709 19.774 1.858C20.344 2.007 20.864 2.305 21.28 2.721C21.696 3.138 21.994 3.658 22.142 4.227C22.291 4.797 22.285 5.396 22.125 5.963C21.965 6.529 21.657 7.043 21.233 7.451C20.84 7.829 20.359 8.101 19.836 8.249L21.301 9.714C21.602 10.014 21.84 10.37 22.003 10.762C22.165 11.155 22.249 11.575 22.249 12Z" fill="#E6E6E6" />
    </svg>
  )
}

function PlusDriveIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M6.855 12.713H1.5C1.5 13.013 1.578 13.314 1.734 13.585L2.785 15.396L3.535 16.685C3.691 16.956 3.915 17.169 4.178 17.324L6.855 12.713Z" fill="#0066DA" />
      <path fillRule="evenodd" clipRule="evenodd" d="M15.822 17.324C16.085 17.169 16.309 16.956 16.465 16.685L16.777 16.152L18.266 13.585C18.419 13.32 18.5 13.019 18.5 12.713H13.155L15.822 17.324Z" fill="#EA4335" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12.678 2.678L10 7.289L7.323 2.678C7.586 2.533 7.887 2.445 8.199 2.445H11.801C12.113 2.445 12.415 2.523 12.678 2.678Z" fill="#00832D" />
      <path d="M18.5 12.713C18.5 12.413 18.413 12.113 18.257 11.842L15.793 7.579L13.32 3.317C13.165 3.046 12.941 2.833 12.678 2.678L10 7.289L13.155 12.713H18.5Z" fill="#FFBA00" />
      <path d="M6.855 12.713L4.178 17.324C4.44 17.479 4.742 17.556 5.054 17.556H14.946C15.258 17.556 15.56 17.469 15.822 17.324L13.155 12.713H6.855Z" fill="#2684FC" />
      <path d="M1.734 11.842C1.581 12.107 1.5 12.407 1.5 12.713H6.855L10 7.289L7.323 2.678C7.06 2.833 6.836 3.046 6.68 3.317L1.734 11.842Z" fill="#00AC47" />
    </svg>
  )
}

function PlusOneDriveIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11.61 10.356C11.61 10.356 15.468 8.194 15.534 8.227C15.166 6.787 14.241 5.551 12.963 4.791C11.686 4.03 10.159 3.807 8.717 4.17C7.36 4.512 6.183 5.356 5.424 6.531C5.457 6.531 11.61 10.356 11.61 10.356Z" fill="#0364B8" />
      <path d="M7.852 7.196C7.141 6.761 6.324 6.531 5.49 6.531L5.424 6.531C4.233 6.55 3.099 7.039 2.269 7.894C1.44 8.748 0.984 9.897 1 11.087C1.015 11.989 1.292 12.868 1.799 13.615L7.985 12.983L11.61 9.491L7.852 7.196Z" fill="#0F78D4" />
      <path d="M15.568 8.227H15.335C14.842 8.223 14.355 8.325 13.905 8.526L11.643 9.457L14.104 12.184L18.561 13.581C18.79 13.158 18.933 12.694 18.981 12.215C19.03 11.736 18.983 11.252 18.844 10.792C18.705 10.331 18.476 9.903 18.171 9.531C17.865 9.159 17.489 8.852 17.064 8.626C16.596 8.397 16.088 8.261 15.568 8.227Z" fill="#1490DF" />
      <path d="M15.335 11.686L14.404 11.121L12.276 9.857L11.611 9.458L9.914 10.19L6.622 11.587L5.125 12.185L1.799 13.582C2.215 14.176 2.768 14.661 3.41 14.997C4.053 15.332 4.766 15.509 5.491 15.511H15.302C15.963 15.507 16.611 15.326 17.179 14.987C17.746 14.648 18.212 14.163 18.528 13.582L15.335 11.686Z" fill="#28A8EA" />
    </svg>
  )
}

function PlusFigmaIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M0 12C0 5.373 5.373 0 12 0H52C58.627 0 64 5.373 64 12V52C64 58.627 58.627 64 52 64H12C5.373 64 0 58.627 0 52V12Z" fill="#1A1A19" />
      <path d="M32.139 31.916C32.139 27.782 35.49 24.43 39.625 24.43C43.76 24.43 47.112 27.782 47.112 31.916C47.112 36.051 43.76 39.403 39.625 39.403C35.49 39.403 32.139 36.051 32.139 31.916Z" fill="#1ABCFE" />
      <path d="M17.166 46.887C17.166 42.752 20.518 39.4 24.653 39.4H32.139V46.887C32.139 51.022 28.787 54.374 24.653 54.374C20.518 54.374 17.166 51.022 17.166 46.887Z" fill="#0ACF83" />
      <path d="M32.141 9.455V24.428H39.627C43.762 24.428 47.114 21.076 47.114 16.942C47.114 12.807 43.762 9.455 39.627 9.455H32.141Z" fill="#FF7262" />
      <path d="M17.166 16.942C17.166 21.076 20.518 24.428 24.653 24.428H32.139V9.455H24.653C20.518 9.455 17.166 12.807 17.166 16.942Z" fill="#F24E1E" />
      <path d="M17.166 31.916C17.166 36.051 20.518 39.403 24.653 39.403H32.139V24.43H24.653C20.518 24.43 17.166 27.782 17.166 31.916Z" fill="#A259FF" />
    </svg>
  )
}

export interface BuilderSettingsMenuProps {
  agent: string
  agents: AgentProfile[]
  onAgent(next: string): void
  connectorOptions: string[]
  connectors: string[]
  onConnectors(next: string[]): void
  onConnectApps(): void
  expiresAt: string
  onExpiresAt(next: string): void
}

/** Automation settings menu. Agent, connectors and expiry are live controls. */
export function BuilderSettingsMenu(props: BuilderSettingsMenuProps): React.JSX.Element {
  const rows: { id: string; label: string; value: string; icon: React.ReactNode; control?: React.ReactNode }[] = [
    {
      id: 'confirmations', label: 'Confirmations', value: 'Writes blocked',
      icon: (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M8 0.733C8.513 0.733 9.005 0.937 9.367 1.299C9.626 1.558 9.802 1.883 9.882 2.234C10.127 2.126 10.394 2.066 10.667 2.066C11.179 2.066 11.671 2.27 12.034 2.633C12.293 2.892 12.468 3.217 12.549 3.568C12.794 3.459 13.06 3.4 13.333 3.4C13.846 3.4 14.338 3.604 14.7 3.966C15.063 4.329 15.267 4.821 15.267 5.333V9.333C15.267 10.907 14.641 12.416 13.529 13.529C12.416 14.641 10.907 15.267 9.333 15.267H8C5.972 15.267 4.688 14.629 3.584 13.533L1.182 11.131C1.175 11.124 1.168 11.116 1.161 11.109C0.829 10.74 0.65 10.258 0.663 9.762C0.677 9.266 0.88 8.794 1.232 8.443C1.583 8.093 2.056 7.892 2.552 7.88C2.847 7.873 3.137 7.936 3.4 8.057V4C3.4 3.487 3.604 2.995 3.966 2.633C4.329 2.27 4.821 2.066 5.333 2.066C5.606 2.066 5.873 2.126 6.117 2.234C6.198 1.883 6.374 1.558 6.633 1.299C6.995 0.937 7.487 0.733 8 0.733ZM8 1.934C7.806 1.934 7.619 2.011 7.482 2.148C7.344 2.286 7.267 2.472 7.267 2.667V7C7.267 7.331 6.998 7.6 6.667 7.6C6.335 7.6 6.067 7.331 6.067 7V4L6.063 3.928C6.047 3.76 5.972 3.602 5.852 3.482C5.715 3.344 5.528 3.267 5.333 3.267C5.139 3.267 4.953 3.344 4.815 3.482C4.678 3.619 4.6 3.806 4.6 4V9.085L5.091 9.576C5.325 9.81 5.325 10.19 5.091 10.425C4.857 10.659 4.476 10.659 4.242 10.425L3.579 9.76C3.577 9.758 3.574 9.756 3.572 9.754L3.085 9.268C2.947 9.143 2.766 9.076 2.579 9.08C2.391 9.084 2.212 9.161 2.079 9.294C1.945 9.426 1.868 9.605 1.863 9.794C1.858 9.979 1.924 10.159 2.046 10.297L4.43 12.681L4.596 12.841C5.438 13.62 6.401 14.066 8 14.066H9.333C10.589 14.066 11.793 13.568 12.68 12.68C13.568 11.793 14.067 10.589 14.067 9.333V5.333C14.067 5.139 13.99 4.953 13.852 4.815C13.715 4.678 13.528 4.6 13.333 4.6C13.139 4.6 12.953 4.678 12.815 4.815C12.678 4.953 12.6 5.139 12.6 5.333V7.333C12.6 7.665 12.331 7.934 12 7.934C11.669 7.934 11.4 7.665 11.4 7.333V4C11.4 3.806 11.323 3.619 11.186 3.482C11.048 3.344 10.861 3.267 10.667 3.267C10.472 3.267 10.286 3.344 10.149 3.482C10.011 3.619 9.934 3.806 9.934 4V6.667C9.934 6.998 9.665 7.267 9.333 7.267C9.002 7.267 8.734 6.998 8.734 6.667V2.667C8.734 2.472 8.656 2.286 8.519 2.148C8.381 2.011 8.194 1.934 8 1.934Z" fill="#E6E6E6" />
        </svg>
      )
    },
    {
      id: 'run-in', label: 'Run in', value: 'Separate task',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 5h8" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 12h8" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 19h8" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m3 17 2 2 4-4" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="4" width="6" height="6" rx="1" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'agent', label: 'Agent', value: props.agent || 'None',
      control: (
        <select
          className="st-select"
          aria-label="Agent"
          value={props.agent}
          onChange={(event) => props.onAgent(event.target.value)}
        >
          <option value="">None</option>
          {props.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      ),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="1" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'connectors', label: 'Connectors', value: props.connectors.length ? `${props.connectors.length} selected` : 'None',
      control: (
        <ConnectorPicker
          options={props.connectorOptions}
          selected={props.connectors}
          onChange={props.onConnectors}
        />
      ),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 21v-2" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 21v-2" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 5V3" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 5V3" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'project', label: 'Project', value: 'None',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'cloud', label: 'Cloud computer', value: 'None',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'local', label: 'Local folder', value: 'None',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 10h20" fill="none" stroke="#E6E6E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'expiration', label: 'Expiration date', value: props.expiresAt || 'None',
      control: (
        <input
          type="date"
          className="st-input st-date"
          aria-label="Expiration date"
          value={props.expiresAt}
          onChange={(event) => props.onExpiresAt(event.target.value)}
        />
      ),
      icon: (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M10.667 0.733C10.998 0.733 11.267 1.002 11.267 1.333V2.066H12.667C13.734 2.066 14.6 2.932 14.6 4V13.333C14.6 14.401 13.734 15.267 12.667 15.267H3.333C2.266 15.267 1.4 14.401 1.4 13.333V4C1.4 2.932 2.266 2.066 3.333 2.066H4.733V1.333C4.733 1.002 5.002 0.733 5.333 0.733C5.665 0.733 5.934 1.002 5.934 1.333V2.066H10.066V1.333C10.066 1.002 10.335 0.733 10.667 0.733ZM2.6 13.333C2.6 13.738 2.928 14.066 3.333 14.066H12.667C13.072 14.066 13.4 13.738 13.4 13.333V7.267H2.6V13.333ZM3.333 3.267C2.928 3.267 2.6 3.595 2.6 4V6.066H13.4V4C13.4 3.595 13.072 3.267 12.667 3.267H11.267V4C11.267 4.331 10.998 4.6 10.667 4.6C10.335 4.6 10.066 4.331 10.066 4V3.267H5.934V4C5.934 4.331 5.665 4.6 5.333 4.6C5.002 4.6 4.733 4.331 4.733 4V3.267H3.333Z" fill="#E6E6E6" />
        </svg>
      )
    },
  ]
  return (
    <div className="builder-setmenu" role="menu" aria-label="Automation settings">
      {rows.map((row) => (
        <div key={row.id} className="builder-setmenu-item">
          <div className="builder-setrow">
            <div className="builder-setic">{row.icon}</div>
            <div className="builder-setlabel">
              <div>{row.label}</div>
            </div>
            {row.control ? (
              <div className="builder-setval">{row.control}</div>
            ) : (
              <>
                <div className="builder-setval">
                  <div>{row.value}</div>
                </div>
                <MenuChevronIcon />
              </>
            )}
          </div>
        </div>
      ))}
      <p className="builder-setnote">Scheduled runs are read-only: sending, writing, deleting and pushing are always blocked.</p>
      <button type="button" className="builder-connect" onClick={props.onConnectApps}>Connect apps</button>
    </div>
  )
}

function patchTrigger(setTriggers: React.Dispatch<React.SetStateAction<BuilderTrigger[]>>, id: string, patch: Partial<BuilderTrigger>): void {
  setTriggers((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)))
}

export default function Builder(props: BuilderProps): React.JSX.Element {
  const [triggers, setTriggers] = useState(props.initial.triggers)
  const [task, setTask] = useState(props.initial.task)
  const [tools, setTools] = useState<string[]>(props.initial.tools)
  const [agent, setAgent] = useState(props.initial.agent)
  const [expiresAt, setExpiresAt] = useState('')
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [connectorOptions, setConnectorOptions] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerApp, setPickerApp] = useState<string | null>(null)
  const [configEditingId, setConfigEditingId] = useState<string | null>(null)
  const [pickerBox, setPickerBox] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerAnchorRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [skillsSubmenuOpen, setSkillsSubmenuOpen] = useState(false)
  const [recentTasksSubmenuOpen, setRecentTasksSubmenuOpen] = useState(false)
  const [recentTasks, setRecentTasks] = useState<RunRecord[]>([])
  const [driveOpen, setDriveOpen] = useState(false)
  const [driveQuery, setDriveQuery] = useState('')
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | null>(null)
  const [driveState, setDriveState] = useState<'idle' | 'loading' | 'ready' | 'connect' | 'error'>('idle')
  const [driveMessage, setDriveMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attachments = useAttachments()

  // Custom Dropdown Menus State (for timing & connectors)
  const [openRepeatId, setOpenRepeatId] = useState<string | null>(null)
  const [openTimeId, setOpenTimeId] = useState<string | null>(null)
  const [connectorMenuOpen, setConnectorMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // The agent and the connected apps the task may use.
  useEffect(() => {
    let live = true
    void window.app.agentsList()
      .then((res) => { if (live && res.ok && res.agents) setAgents(res.agents) })
      .catch(() => {})
    void window.app.getConnector()
      .then((res) => {
        if (!live) return
        setConnectorOptions((res.services ?? []).filter((service) => service.connected).map((service) => service.id))
      })
      .catch(() => {})
    return () => { live = false }
  }, [])

  // The sheet's backdrop-filter clips in-flow popovers and the builder overlay
  // scrolls, so the picker is portalled and anchored to the trigger button.
  useEffect(() => {
    if (!pickerOpen) {
      setPickerBox(null)
      return
    }
    const place = (): void => {
      const rect = triggerAnchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setPickerBox({ top: rect.bottom + 8, left: rect.left, width: rect.width })
    }
    const close = (): void => {
      setPickerOpen(false)
      setPickerApp(null)
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (!target) return
      if (triggerAnchorRef.current?.contains(target) || pickerRef.current?.contains(target)) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pickerOpen])

  const compiled = useMemo(
    () => draftToAutomation({ title: props.initial.title, triggers, task, tools, agent }),
    [props.initial.title, triggers, task, tools, agent]
  )

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!compiled.valid || !compiled.create || busy) return

    setBusy(true)
    setError('')

    try {
      const create: AutomationCreate = { ...compiled.create }

      // Attached Drive files need Composio tools for the agent to read them.
      if (needsComposioTools(attachments.files) && !create.connectors.includes('composio')) {
        create.connectors = [...create.connectors, 'composio']
      }

      // Attached files travel as readable references (chips state, not raw text).
      const attachText = attachmentPromptText(attachments.files)
      if (attachText) {
        create.prompt = `${create.prompt} ${attachText}`.trim()
      }

      if (expiresAt) {
        // The contract takes a full timestamp; the picker gives a local day.
        create.expiresAt = new Date(`${expiresAt}T23:59:59`).toISOString()
      }

      const err = await props.onSubmit(create)
      if (err) {
        setError(err)
        setBusy(false)
        return
      }
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function toggleTool(id: ActiveToolId): void {
    setTools((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]))
  }

  function addEventTrigger(app: string, phrase: string): void {
    setTriggers((cur) => [...cur, { ...blankTrigger('event'), id: makeTriggerId(), app, event: phrase }])
    setPickerOpen(false)
    setPickerApp(null)
  }

  function addScheduleTrigger(): void {
    setTriggers((cur) => cur.some((t) => t.kind === 'schedule') ? cur : [...cur, blankTrigger('schedule')])
    setPickerOpen(false)
    setPickerApp(null)
  }

  function toggleTriggerPicker(): void {
    setPickerOpen((open) => !open)
    setPickerApp(null)
  }

  /** true/false when this app can read the status, undefined for Composio-backed toolkits. */
  function triggerConnection(appId: string): boolean | undefined {
    if (appId === 'gmail') return props.gmailConnected === true
    if (triggerMention(appId) === appId) return connectorOptions.includes(appId)
    return undefined
  }

  async function handleLocalFilesClick(): Promise<void> {
    setAddMenuOpen(false)
    await attachments.attachLocal()
  }

  /** Open the Drive picker and load the first page of real Drive files. */
  async function openDrivePicker(): Promise<void> {
    setDriveOpen((open) => !open)
    await loadDriveFiles('')
  }

  async function loadDriveFiles(query: string): Promise<void> {
    setDriveState('loading')
    setDriveMessage('')
    setDriveFiles(null)
    try {
      const res = await window.app.driveListFiles(query)
      if (res.ok && res.files) {
        setDriveFiles(res.files)
        setDriveState('ready')
      } else if (res.notConnected) {
        setDriveState('connect')
        setDriveMessage(res.error ?? 'Connect Google Drive first.')
      } else {
        setDriveState('error')
        setDriveMessage(res.error ?? 'Could not list Google Drive files.')
      }
    } catch (err) {
      setDriveState('error')
      setDriveMessage(err instanceof Error ? err.message : String(err))
    }
  }

  async function connectDrive(): Promise<void> {
    setDriveState('loading')
    setDriveMessage('Opening Google sign-in in your browser…')
    try {
      const res = await window.app.composioConnect('googledrive')
      if (res.ok) {
        setDriveState('connect')
        setDriveMessage('Complete the sign-in in your browser, then press Refresh.')
      } else {
        setDriveState('connect')
        setDriveMessage(res.error ?? 'Could not start the Google Drive connection.')
      }
    } catch (err) {
      setDriveState('connect')
      setDriveMessage(err instanceof Error ? err.message : String(err))
    }
  }

  function attachDriveFile(file: DriveFile): void {
    attachments.attachDrive({ id: file.id, name: file.name, mimeType: file.mimeType })
    setDriveOpen(false)
  }

  async function loadRecentTasks(): Promise<void> {
    try {
      const res = await window.app.recentTasks(6)
      if (res.ok && res.runs) {
        setRecentTasks(res.runs)
      }
    } catch {
      setRecentTasks([])
    }
  }


  function parseTimeParts(time24: string): { ampm: 'AM' | 'PM'; hour12: string; minute: string } {
    const [hStr = '09', mStr = '00'] = time24.split(':')
    const h = parseInt(hStr, 10) || 9
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return {
      ampm,
      hour12: String(h12).padStart(2, '0'),
      minute: mStr.padStart(2, '0')
    }
  }

  function formatTimeDisplay(time24: string): string {
    const parts = parseTimeParts(time24)
    return `${parts.ampm} ${parseInt(parts.hour12, 10)}:${parts.minute}`
  }

  function updateTriggerTime(triggerId: string, current24: string, patch: Partial<{ ampm: 'AM' | 'PM'; hour12: string; minute: string }>): void {
    const cur = parseTimeParts(current24)
    const nextAmpm = patch.ampm ?? cur.ampm
    const nextHour12 = parseInt(patch.hour12 ?? cur.hour12, 10)
    const nextMin = patch.minute ?? cur.minute

    let h24 = nextHour12 % 12
    if (nextAmpm === 'PM') h24 += 12
    const next24 = `${String(h24).padStart(2, '0')}:${nextMin}`
    patchTrigger(setTriggers, triggerId, { time: next24 })
  }

  const hasEvent = triggers.some((t) => t.kind === 'event')
  // No trigger yet means the event picker is what the user picks next.
  const heading = hasEvent || triggers.length === 0 ? 'When this happens' : 'When'

  const selectedApp = pickerApp ? triggerApp(pickerApp) : undefined

  const picker = pickerOpen && pickerBox && createPortal(
    <div
      ref={pickerRef}
      className="picker-panel"
      role="menu"
      aria-label="Choose a trigger"
      style={{
        top: pickerBox.top,
        left: pickerBox.left,
        width: pickerBox.width,
        maxHeight: `min(520px, calc(100vh - ${pickerBox.top + 16}px))`
      }}
    >
      {selectedApp ? (
        <>
          <button type="button" className="picker-head" onClick={() => setPickerApp(null)}>
            <span aria-hidden="true">‹</span> {selectedApp.label}
          </button>
          {selectedApp.events.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="picker-item"
              onClick={() => addEventTrigger(selectedApp.id, item.phrase)}
            >
              {item.label}
            </button>
          ))}
        </>
      ) : (
        <div className="picker-grid">
          {TRIGGER_APPS.map((app) => (
            <button
              key={app.id}
              type="button"
              role="menuitem"
              className="picker-card"
              onClick={() => setPickerApp(app.id)}
            >
              <TriggerAppIcon app={app} size={26} />
              <span className="picker-card-label">{app.label}</span>
            </button>
          ))}
          <button type="button" role="menuitem" className="picker-card" onClick={addScheduleTrigger}>
            <TriggerAppIcon app={TIMER_TRIGGER} size={26} />
            <span className="picker-card-label">{TIMER_TRIGGER.label}</span>
          </button>
        </div>
      )}
    </div>,
    document.body
  )

  return (
    <>
      <div className="builder-overlay" role="dialog" aria-modal="true" aria-label="Create automation">
        {/* Outside-click backdrop shared by the repeat/time/plus/settings dropdowns */}
        {(openRepeatId !== null || openTimeId !== null || addMenuOpen || settingsOpen || driveOpen) && (
          <button
            type="button"
            className="builder-pop-backdrop"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => {
              setOpenRepeatId(null)
              setOpenTimeId(null)
              setAddMenuOpen(false)
              setSettingsOpen(false)
              setDriveOpen(false)
            }}
          />
        )}

        <form className="builder-sheet" onSubmit={(e) => void submit(e)}>
          <div className="builder-sheet-body">
            <div className="builder-sheet-section">
              <div className="builder-sheet-head">
                <div className="builder-sheet-title">
                  {heading}
                </div>
                <button type="button" aria-label="Close builder" onClick={props.onClose} className="builder-sheet-x">
                  <PaperCloseIcon />
                </button>
              </div>
              {/* Triggers: Schedule */}
                  {triggers.filter((t) => t.kind === 'schedule').map((trigger) => {
                    const timeParts = parseTimeParts(trigger.time)
                    const isRepeatOpen = openRepeatId === trigger.id
                    const isTimeOpen = openTimeId === trigger.id

                    const selectedRepeatLabel =
                      REPEAT_OPTIONS.find((r) => r.value === trigger.repeat)?.label ?? 'Daily'

                    return (
                      <Fragment key={trigger.id}>
                      <div className="builder-whenbox">
                        <div className="builder-whenrow">
                          <div className="builder-whenclock">
                            <PaperClockIcon />
                          </div>
                          <div className="builder-whenclip">
                            <div className="builder-whenline">
                              <div className="builder-whenpills">
                                <div className="builder-menu-anchor">
                                  <button
                                    type="button"
                                    className="builder-pillbtn is-repeat"
                                    aria-label="Repeat"
                                    aria-expanded={isRepeatOpen}
                                    onClick={() => {
                                      setOpenRepeatId(isRepeatOpen ? null : trigger.id)
                                      setOpenTimeId(null)
                                    }}
                                  >
                                    <div className="builder-pilltext is-repeat">
                                      {selectedRepeatLabel}
                                    </div>
                                    <PaperChevronIcon />
                                  </button>

                          {isRepeatOpen && (
                            <div className="builder-repeat-popup" role="menu">
                              {REPEAT_OPTIONS.map((opt, idx) => {
                                const isSelected = opt.label.toLowerCase() === selectedRepeatLabel.toLowerCase()
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    role="menuitem"
                                    className={`builder-repeat-item ${isSelected ? 'is-selected' : ''}`}
                                    onClick={() => {
                                      patchTrigger(setTriggers, trigger.id, { repeat: opt.value })
                                      setOpenRepeatId(null)
                                    }}
                                  >
                                    <span>{opt.label}</span>
                                    {isSelected && <span className="builder-repeat-check">✓</span>}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        <div className="builder-whenat">
                          at
                        </div>

                        <div className="builder-menu-anchor">
                          <button
                            type="button"
                            className="builder-pillbtn"
                            aria-label="Time"
                            aria-expanded={isTimeOpen}
                            onClick={() => {
                              setOpenTimeId(isTimeOpen ? null : trigger.id)
                              setOpenRepeatId(null)
                            }}
                          >
                            <div className="builder-pilltext">
                              {formatTimeDisplay(trigger.time)}
                            </div>
                            <PaperChevronIcon />
                          </button>

                          {isTimeOpen && (
                            <div className="builder-time-popup" role="dialog" aria-label="Choose time">
                              <div className="builder-time-cols">
                                {/* Column 1: AM / PM */}
                                <div className="builder-time-col ampm-col">
                                  {(['AM', 'PM'] as const).map((ap) => (
                                    <button
                                      key={ap}
                                      type="button"
                                      className={`builder-time-option ${timeParts.ampm === ap ? 'is-selected' : ''}`}
                                      onClick={() => updateTriggerTime(trigger.id, trigger.time, { ampm: ap })}
                                    >
                                      {ap}
                                    </button>
                                  ))}
                                </div>

                                {/* Column 2: Hours (01 - 12) */}
                                <div className="builder-time-col">
                                  {HOURS_LIST.map((hr) => (
                                    <button
                                      key={hr}
                                      type="button"
                                      className={`builder-time-option ${timeParts.hour12 === hr ? 'is-selected' : ''}`}
                                      onClick={() => updateTriggerTime(trigger.id, trigger.time, { hour12: hr })}
                                    >
                                      {hr}
                                    </button>
                                  ))}
                                </div>

                                {/* Column 3: Minutes (00, 15, 30, 45) */}
                                <div className="builder-time-col">
                                  {MINUTES_LIST.map((mn) => (
                                    <button
                                      key={mn}
                                      type="button"
                                      className={`builder-time-option ${timeParts.minute === mn ? 'is-selected' : ''}`}
                                      onClick={() => {
                                        updateTriggerTime(trigger.id, trigger.time, { minute: mn })
                                        setOpenTimeId(null)
                                      }}
                                    >
                                      {mn}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* The schedule the contract stores: day-of-month, weekdays or a date. */}
                      {trigger.repeat === 'weekly' && (
                        <div className="builder-whenrow st-weekdays" role="group" aria-label="Days of the week">
                          {WEEKDAY_LABELS.map((label, day) => (
                            <button
                              key={label}
                              type="button"
                              aria-pressed={trigger.weekdays.includes(day)}
                              onClick={() => patchTrigger(setTriggers, trigger.id, {
                                weekdays: trigger.weekdays.includes(day)
                                  ? trigger.weekdays.filter((item) => item !== day)
                                  : [...trigger.weekdays, day]
                              })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                      {trigger.repeat === 'once' && (
                        <div className="builder-whenrow">
                          <input
                            type="date"
                            className="st-input st-date"
                            aria-label="Date"
                            value={trigger.date}
                            onChange={(e) => patchTrigger(setTriggers, trigger.id, { date: e.currentTarget.value })}
                          />
                        </div>
                      )}
                      {trigger.repeat === 'monthly' && (
                        <div className="builder-whenrow">
                          <span className="builder-sched-note">on day</span>
                          <select
                            aria-label="Day of the month"
                            value={trigger.dayOfMonth}
                            onChange={(e) => patchTrigger(setTriggers, trigger.id, { dayOfMonth: Number(e.target.value) })}
                          >
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                              <option key={day} value={day}>{day}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      </Fragment>
                    )
                  })}

                  {/* Triggers: Event */}
                  {triggers.filter((t) => t.kind === 'event').map((trigger, i) => {
                    const app = triggerApp(trigger.app)
                    const fields = triggerEvent(trigger.app, trigger.event)?.config ?? []
                    const connection = triggerConnection(trigger.app)
                    const status = connection === undefined ? 'Via Composio' : connection ? 'Connected' : 'Not connected'
                    const tone = connection === undefined ? 'is-muted' : connection ? 'is-on' : 'is-off'
                    const filled = Object.values(trigger.config ?? {}).some((value) => value.trim())
                    const configOpen = configEditingId === trigger.id || filled
                    const firstInput = fields.findIndex((field) => !field.options)
                    return (
                      <div key={trigger.id} className="builder-trig">
                        <div className="builder-trig-line">
                          {app ? <TriggerAppIcon app={app} size={22} /> : null}
                          <span className="builder-trig-text">When {trigger.event || 'something happens'} in {app?.label ?? trigger.app}</span>
                          <span className={`builder-status ${tone}`}>
                            <span className="builder-status-dot" aria-hidden="true" />
                            {status}
                          </span>
                          {connection !== true && (
                            <button type="button" className="builder-connect" onClick={props.onConnect}>Connect</button>
                          )}
                          <button
                            type="button"
                            className="builder-iconbtn"
                            aria-label={`Remove trigger ${i + 1}`}
                            onClick={() => setTriggers((cur) => cur.filter((t) => t.id !== trigger.id))}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        {fields.length > 0 && (
                          <div className="builder-trig-line indent">
                            {configOpen ? (
                              <div className="builder-cfg">
                                <span className="builder-sched-note">Only when</span>
                                <div className="builder-cfg-fields">
                                  {fields.map((field, index) => (
                                    <label key={field.key} className="builder-cfg-field">
                                      <span>{field.label}</span>
                                      {field.options ? (
                                        <select
                                          value={trigger.config?.[field.key] ?? ''}
                                          onChange={(event) => patchTrigger(setTriggers, trigger.id, {
                                            config: { ...trigger.config, [field.key]: event.currentTarget.value }
                                          })}
                                        >
                                          <option value="">{field.placeholder}</option>
                                          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                                        </select>
                                      ) : (
                                        <input
                                          autoFocus={configEditingId === trigger.id && index === firstInput}
                                          className="builder-pill-input"
                                          aria-label={field.label}
                                          placeholder={field.placeholder}
                                          value={trigger.config?.[field.key] ?? ''}
                                          onChange={(event) => patchTrigger(setTriggers, trigger.id, {
                                            config: { ...trigger.config, [field.key]: event.currentTarget.value }
                                          })}
                                        />
                                      )}
                                    </label>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="builder-cond-remove"
                                  aria-label="Clear conditions"
                                  onClick={() => {
                                    patchTrigger(setTriggers, trigger.id, { config: {} })
                                    setConfigEditingId(null)
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="builder-cond"
                                title="Optional filters from the Composio trigger config."
                                onClick={() => setConfigEditingId(trigger.id)}
                              >
                                + Add conditions <span className="builder-q" aria-hidden="true">?</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {(triggers.length === 0 || hasEvent) && (
                    <div className="builder-menu-anchor builder-trig-anchor" ref={triggerAnchorRef}>
                      <button type="button" className="builder-addtrig" onClick={toggleTriggerPicker} aria-expanded={pickerOpen}>
                        {triggers.length === 0 ? '+ Add Trigger' : '+ Add another trigger'}
                      </button>
                      {picker}
                    </div>
                  )}

                  </div>
                  <div className="builder-sheet-section">
                    <div className="builder-willlabel">
                      Palette will
                    </div>
                    <textarea
                      className="builder-taskbox"
                      rows={3}
                      value={task}
                      onChange={(e) => setTask(e.currentTarget.value)}
                      placeholder="Describe what Palette should do, e.g. summarize the latest AI news and send me the highlights"
                    />
                    {attachments.files.length > 0 && (
                      <div className="builder-attached-files">
                        {attachments.files.map((file) => (
                          <div key={file.ref} className="builder-file-chip" data-kind={file.kind}>
                            <span className="builder-file-name" title={file.ref}>{file.name}</span>
                            <button
                              type="button"
                              className="builder-file-remove"
                              aria-label={`Remove ${file.name}`}
                              onClick={() => attachments.remove(file.ref)}
                            >
                              <PaperCloseIcon />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {attachments.error && (
                      <p className="builder-attach-error" role="alert">{attachments.error}</p>
                    )}
                  </div>
                </div>

          {error && <p role="alert" className="automations-error">{error}</p>}

              {/* Footer */}
              <div className="builder-paperfoot">
                <div className="builder-paperfoot-row">
                    <div className="builder-paperfoot-flex">
                      <div className="builder-paperfoot-left">
                        <div className="builder-paperfoot-btns">
                          <div className="builder-menu-anchor">
                            <button
                              type="button"
                              aria-label="Add connector or tool"
                              aria-expanded={addMenuOpen}
                              onClick={() => {
                                setAddMenuOpen((v) => !v)
                                setSkillsSubmenuOpen(false)
                                setRecentTasksSubmenuOpen(false)
                              }}
                              className="builder-roundbtn is-dim"
                            >
                              <PaperPlusIcon />
                            </button>

                    {addMenuOpen && (
                      <div className="builder-plus-menu" role="menu" aria-label="Insert options">
                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={handleLocalFilesClick}
                        >
                          <span className="plus-menu-icon"><PlusLocalIcon /></span>
                          <span className="plus-menu-label">Local files</span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}Create artifact with OpenCode`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon"><PlusCreationsIcon /></span>
                          <span className="plus-menu-label">Creations</span>
                          <span className="plus-menu-arrow"><MenuChevronIcon /></span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}Use prompt library routine`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon"><PlusLibraryIcon /></span>
                          <span className="plus-menu-label">Library</span>
                          <span className="plus-menu-arrow"><MenuChevronIcon /></span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            void loadRecentTasks()
                            setRecentTasksSubmenuOpen((v) => !v)
                            setSkillsSubmenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon"><PlusRecentIcon /></span>
                          <span className="plus-menu-label">Recent tasks</span>
                          <span className="plus-menu-arrow"><MenuChevronIcon /></span>
                        </button>

                        {/* Recent tasks submenu */}
                        {recentTasksSubmenuOpen && (
                          <div className="plus-submenu">
                            {recentTasks.length === 0 ? (
                              <div className="plus-submenu-empty">No recent tasks</div>
                            ) : (
                              recentTasks.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="plus-submenu-item"
                                  onClick={() => {
                                    setTask((prev) => `${prev ? `${prev} ` : ''}${t.title}`)
                                    setAddMenuOpen(false)
                                    setRecentTasksSubmenuOpen(false)
                                  }}
                                >
                                  {t.title.slice(0, 36)}…
                                </button>
                              ))
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setSkillsSubmenuOpen((v) => !v)
                            setRecentTasksSubmenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon"><PlusSkillsIcon /></span>
                          <span className="plus-menu-label">Use skills</span>
                          <span className="plus-menu-arrow"><MenuChevronIcon /></span>
                        </button>

                        {/* Skills submenu */}
                        {skillsSubmenuOpen && (
                          <div className="plus-submenu">
                            {TOOL_IDS.map((id: ActiveToolId) => (
                              <button
                                key={id}
                                type="button"
                                className="plus-submenu-item"
                                onClick={() => {
                                  toggleTool(id)
                                  setAddMenuOpen(false)
                                  setSkillsSubmenuOpen(false)
                                }}
                              >
                                {tools.includes(id) ? '✓ ' : ''}{TOOL_META[id].label}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="plus-menu-divider" />

                        <button
                          type="button"
                          className="plus-menu-item"
                          aria-expanded={driveOpen}
                          onClick={() => {
                            void openDrivePicker()
                            setSkillsSubmenuOpen(false)
                            setRecentTasksSubmenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon"><PlusDriveIcon /></span>
                          <span className="plus-menu-label">Add from Google Drive files</span>
                          <span className="plus-menu-arrow"><MenuChevronIcon /></span>
                        </button>

                        {/* Google Drive picker (real files via Composio) */}
                        {driveOpen && (
                          <div className="plus-submenu drive-picker" role="dialog" aria-label="Add from Google Drive">
                            <div className="drive-picker-head">
                              <button
                                type="button"
                                className="drive-picker-back"
                                aria-label="Close Drive picker"
                                onClick={() => setDriveOpen(false)}
                              >
                                ‹
                              </button>
                              <span>Google Drive</span>
                            </div>
                            <form
                              className="drive-picker-search"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void loadDriveFiles(driveQuery)
                              }}
                            >
                              <input
                                aria-label="Search Google Drive"
                                placeholder="Search files"
                                value={driveQuery}
                                onChange={(e) => setDriveQuery(e.currentTarget.value)}
                                disabled={driveState === 'loading'}
                              />
                              <button type="submit" disabled={driveState === 'loading'}>
                                {driveState === 'loading' ? 'Loading…' : 'Search'}
                              </button>
                            </form>
                            {driveState === 'connect' && (
                              <div className="plus-submenu-empty">
                                {driveMessage && <p role="alert">{driveMessage}</p>}
                                <button type="button" className="drive-picker-connect" onClick={() => void connectDrive()}>
                                  Connect Google Drive
                                </button>
                                <button type="button" className="drive-picker-refresh" onClick={() => void loadDriveFiles(driveQuery)}>
                                  Refresh
                                </button>
                              </div>
                            )}
                            {driveState === 'error' && (
                              <div className="plus-submenu-empty" role="alert">{driveMessage || 'Could not list files.'}</div>
                            )}
                            {driveState === 'ready' && (
                              <>
                                {driveFiles && driveFiles.length > 0 ? (
                                  driveFiles.map((file) => (
                                    <button
                                      key={file.id}
                                      type="button"
                                      className="drive-picker-item"
                                      onClick={() => attachDriveFile(file)}
                                    >
                                      <span className="drive-picker-name" title={file.name}>{file.name}</span>
                                      <small title={file.webViewLink ?? file.id}>
                                        {file.modifiedTime ? `${file.modifiedTime.slice(0, 10)} · ` : ''}
                                        {file.webViewLink ?? file.id}
                                      </small>
                                    </button>
                                  ))
                                ) : (
                                  <div className="plus-submenu-empty">No files match “{driveQuery}”.</div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}[OneDrive: search files]`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon"><PlusOneDriveIcon /></span>
                          <span className="plus-menu-label">Add from OneDrive files</span>
                          <span className="plus-menu-arrow"><MenuChevronIcon /></span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}[Figma: inspect component]`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon"><PlusFigmaIcon /></span>
                          <span className="plus-menu-label">Add from Figma</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Automation settings (sliders) with its menu */}
                  <div className="builder-menu-anchor">
                    <button
                      type="button"
                      aria-label="Automation settings"
                      aria-expanded={settingsOpen}
                      onClick={() => setSettingsOpen((v) => !v)}
                      className="builder-roundbtn"
                    >
                      <PaperSlidersIcon />
                    </button>

                    {settingsOpen && (
                      <BuilderSettingsMenu
                        agent={agent}
                        agents={agents}
                        onAgent={setAgent}
                        connectorOptions={connectorOptions}
                        connectors={tools}
                        onConnectors={setTools}
                        onConnectApps={() => {
                          setSettingsOpen(false)
                          setConnectorMenuOpen(true)
                        }}
                        expiresAt={expiresAt}
                        onExpiresAt={setExpiresAt}
                      />
                    )}

                    <BuilderConnectorPopover
                      open={connectorMenuOpen}
                      onClose={() => setConnectorMenuOpen(false)}
                      onOpenSettings={() => {
                        setConnectorMenuOpen(false)
                        window.app.openSettingsWindow('connectors')
                      }}
                    />
                  </div>
                        </div>
                      </div>
                      <div className="builder-paperfoot-right">
                        <button
                          type="submit"
                          className="builder-createbtn"
                          disabled={!compiled.valid || busy}
                          title={compiled.valid ? 'Create scheduled automation' : compiled.error}
                        >
                          {busy ? 'Creating…' : 'Create'}
                        </button>
                      </div>
                    </div>
                  </div>
              </div>
        </form>
      </div>
    </>
  )
}
