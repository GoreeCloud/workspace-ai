import React, { useEffect, useRef, useState } from 'react'
import {useState,useEffect,useRef} from 'react'
import { ListTodo, RefreshCw, ArrowLeft } from 'lucide-react'

export default function TodoistBrowser() {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [project, setProject] = useState(null)
  const [next, setNext] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const load = async (resource, projectId = null, cursor = null) => {
    const request = ++sequence.current
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ resource })
      if (projectId) params.set('projectId', projectId)
      if (cursor) params.set('cursor', cursor)
      const response = await fetch('/api/integrations/todoist/data?' + params.toString())
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'Unable to read Todoist.')
      if (request !== sequence.current) return
      if (resource === 'projects') setProjects(old => cursor ? [...old, ...data.results] : data.results)
      else setTasks(old => cursor ? [...old, ...data.results] : data.results)
      setNext(data.nextCursor)
    } catch (err) {
      if (request === sequence.current) setError(err instanceof Error ? err.message : 'Todoist unavailable.')
    } finally {
      if (request === sequence.current) setBusy(false)
    }
  }
  useEffect(() => { load('projects'); return () => { sequence.current++ } }, [])
  const choose = value => { setProject(value); setTasks([]); setNext(null); load('tasks', value.id) }
  const back = () => { sequence.current++; setProject(null); setTasks([]); setNext(null); load('projects') }
  return <section className="todoistReader" aria-label="Todoist read-only browser">
    <div className="todoistReaderTop">
      {project && <button className="outline" type="button" onClick={back} aria-label="Back to Todoist projects"><ArrowLeft size={15}/></button>}
      <strong><ListTodo size={16} aria-hidden="true"/> {project ? project.name : 'Todoist projects'}</strong>
      <button className="outline" type="button" aria-label="Refresh Todoist list" disabled={busy} onClick={() => load(project ? 'tasks' : 'projects', project?.id)}><RefreshCw size={15}/></button>
    </div>
    <p>Read-only preview · up to 50 results per page</p>
    {error && <p role="alert" className="keyError">{error}</p>}
    <ul className="todoistEntries">
      {project
        ? tasks.map(task => <li key={task.id}><span>{task.content}</span>{task.dueDate && <small>Due {task.dueDate}</small>}</li>)
        : projects.map(item => <li key={item.id}><button type="button" onClick={() => choose(item)}>{item.name}</button>{item.isFavorite && <small>Favorite</small>}</li>)}
    </ul>
    {!busy && !error && (project ? tasks.length === 0 : projects.length === 0) && <p>No results on this page.</p>}
    {busy && <p role="status">Loading Todoist…</p>}
    {next && <button className="outline" type="button" disabled={busy} onClick={() => load(project ? 'tasks' : 'projects', project?.id, next)}>Load more</button>}
  </section>
}
