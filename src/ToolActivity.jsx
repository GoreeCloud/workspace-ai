import React from 'react'
import {
  AlertCircle, CalendarDays, Check, CircleSlash, Clock3, Cloud, FileSearch,
  Github, Globe2, HardDrive, ListChecks, ListTodo, LoaderCircle, Mail,
  Monitor, NotebookText, PackageOpen, Puzzle, Wrench
} from 'lucide-react'
import './tool-activity.css'
import {normalizeToolEvent} from './tool-activity.js'

const providers = {
  github: { name: 'GitHub', Icon: Github, tone: 'github' },
  'github-mcp': { name: 'GitHub', Icon: Github, tone: 'github' },
  'google-drive': { name: 'Google Drive', Icon: HardDrive, tone: 'drive' },
  'google-drive-mcp': { name: 'Google Drive', Icon: HardDrive, tone: 'drive' },
  'gmail-mcp': { name: 'Gmail', Icon: Mail, tone: 'gmail' },
  gmail: { name: 'Gmail', Icon: Mail, tone: 'gmail' },
  'google-calendar': { name: 'Google Calendar', Icon: CalendarDays, tone: 'calendar' },
  todoist: { name: 'Todoist', Icon: ListTodo, tone: 'todoist' },
  'todoist-mcp': { name: 'Todoist', Icon: ListTodo, tone: 'todoist' },
  dropbox: { name: 'Dropbox', Icon: PackageOpen, tone: 'dropbox' },
  'dropbox-mcp': { name: 'Dropbox', Icon: PackageOpen, tone: 'dropbox' },
  linear: { name: 'Linear', Icon: ListChecks, tone: 'linear' },
  'linear-mcp': { name: 'Linear', Icon: ListChecks, tone: 'linear' },
  notion: { name: 'Notion', Icon: NotebookText, tone: 'notion' },
  'notion-mcp': { name: 'Notion', Icon: NotebookText, tone: 'notion' },
  firecrawl: { name: 'Firecrawl', Icon: Globe2, tone: 'firecrawl' },
  'remote-desktop-commander': { name: 'Remote Desktop Commander', Icon: Monitor, tone: 'desktop' },
  search: { name: 'Search', Icon: FileSearch, tone: 'search' },
  web: { name: 'Web', Icon: Globe2, tone: 'search' },
  storage: { name: 'Storage', Icon: Cloud, tone: 'default' },
  mcp: { name: 'MCP tool', Icon: Puzzle, tone: 'default' }
}
const stateIcons = {
  queued: Clock3, running: LoaderCircle, completed: Check,
  failed: AlertCircle, cancelled: CircleSlash, interrupted: AlertCircle
}
const stateNames = {
  queued: 'Waiting', running: 'In progress', completed: 'Completed',
  failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted'
}

export default function ToolActivity({ items = [] }) {
  if (!Array.isArray(items) || items.length === 0) return null
  const entries = items.slice(0,48).map(item => normalizeToolEvent({ ...item, type: 'tool' })).filter(Boolean)
  if (entries.length === 0) return null
  return <section className="chatToolActivity" aria-label="Tool activity">
    <h4>Tool activity</h4>
    <ul>{entries.map(item => {
      const source = Object.hasOwn(providers,item.provider) ? providers[item.provider] : { name: item.provider, Icon: Wrench, tone: 'default' }
      const StatusIcon = stateIcons[item.status] || AlertCircle
      const Icon = source.Icon
      const stateName = stateNames[item.status] || 'Unknown'
      return <li key={item.id} className={'chatToolRow is-' + item.status}>
        <span className={'chatToolIcon tone-' + source.tone} aria-hidden="true"><Icon size={16} strokeWidth={2}/></span>
        <span className="chatToolText"><strong>{item.label}</strong><small>{source.name}</small></span>
        <span className="chatToolState" title={stateName} aria-label={stateName}>
          <StatusIcon size={15} aria-hidden="true"/><span>{stateName}</span>
        </span>
      </li>
    })}</ul>
  </section>
}
