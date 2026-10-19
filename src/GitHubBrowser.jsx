import './github-reader.css'
import React, {useEffect, useRef, useState} from 'react'
import {Github, RefreshCw, ArrowLeft, Search} from 'lucide-react'

// Only GitHub GET results are displayed. No issues, PRs or repositories can be modified here.
export default function GitHubBrowser() {
  const [repos, setRepos] = useState([])
  const [items, setItems] = useState([])
  const [repo, setRepo] = useState(null)
  const [resource, setResource] = useState('issues')
  const [nextPage, setNextPage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const sequence = useRef(0)

  const load = async (kind, repoName = null, page = 1) => {
    const request = ++sequence.current
    setBusy(true)
    setError('')
    try {
      const params = new URLSearchParams({resource: kind, page: String(page)})
      if (repoName) params.set('repo', repoName)
      const response = await fetch('/api/integrations/github/data?' + params.toString())
      const result = await response.json()
      if (!response.ok) throw Error(result.error || 'Could not read GitHub.')
      if (request !== sequence.current) return
      if (kind === 'repos') setRepos(old => page > 1 ? [...old, ...result.results] : result.results)
      else setItems(old => page > 1 ? [...old, ...result.results] : result.results)
      setNextPage(result.nextPage)
    } catch (cause) {
      if (request === sequence.current) setError(cause instanceof Error ? cause.message : 'GitHub unavailable.')
    } finally {
      if (request === sequence.current) setBusy(false)
    }
  }

  useEffect(() => { load('repos'); return () => { sequence.current++ } }, [])
  const choose = selected => {setRepo(selected); setResource('issues'); setItems([]); setNextPage(null); load('issues', selected.name)}
  const back = () => {sequence.current++; setRepo(null); setItems([]); setNextPage(null); load('repos')}
  const selectType = value => {setResource(value); setItems([]); setNextPage(null); load(value, repo.name)}
  const searched = query.trim().toLowerCase()
  const visibleRepos = searched ? repos.filter(item => item.name.toLowerCase().includes(searched) || item.description.toLowerCase().includes(searched)) : repos

  return <section className="githubReader" aria-label="Read-only GoreeCloud GitHub browser">
    <div className="githubReaderTop">
      {repo && <button className="outline" type="button" onClick={back} aria-label="Back to GoreeCloud repositories"><ArrowLeft size={16}/></button>}
      <strong><Github size={17} aria-hidden="true"/> {repo ? repo.name : 'GoreeCloud repositories'}</strong>
      <button className="outline" type="button" onClick={() => load(repo ? resource : 'repos', repo?.name)} disabled={busy} aria-label="Refresh GitHub list"><RefreshCw size={16}/></button>
    </div>
    <p>Read-only · GoreeCloud-owned repositories only · 50 items per page</p>
    {!repo && <label className="githubSearch"><Search size={16} aria-hidden="true"/>
      <span className="sr-only">Search loaded repositories</span>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Filter loaded repositories" aria-label="Search loaded repositories"/>
    </label>}
    {repo && <div className="githubReaderTabs" role="group" aria-label="Repository information">
      <button type="button" className={resource === 'issues' ? 'active' : ''} aria-pressed={resource === 'issues'} onClick={() => selectType('issues')}>Issues</button>
      <button type="button" className={resource === 'pulls' ? 'active' : ''} aria-pressed={resource === 'pulls'} onClick={() => selectType('pulls')}>Pull requests</button>
    </div>}
    {error && <p role="alert" className="keyError">{error}</p>}
    <ul className="githubEntries">
      {!repo ? visibleRepos.map(item => <li key={item.name}>
        <button type="button" onClick={() => choose(item)} title={item.description || item.name}>
          <strong>{item.name}</strong>{item.description && <small>{item.description}</small>}
        </button>
        {item.isPrivate && <small>Private</small>}
      </li>) : items.map(item => <li key={item.number}>
        <span><strong>#{item.number} {item.title}</strong><small>Open · {item.updatedAt.slice(0, 10) || 'date unavailable'}</small></span>
      </li>)}
    </ul>
    {!busy && !error && (repo ? items.length === 0 : visibleRepos.length === 0) &&
      <p>{!repo && searched ? 'No matching repositories in the loaded pages.' : 'No results.'}</p>}
    {busy && <p role="status">Loading GitHub…</p>}
    {nextPage && <button className="outline" disabled={busy} type="button"
      onClick={() => load(repo ? resource : 'repos', repo?.name, nextPage)}>Load more</button>}
  </section>
}
