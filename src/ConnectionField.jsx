import React, { useState } from 'react'
import { Eye, EyeOff, KeyRound, CheckCircle2, Trash2 } from 'lucide-react'

export default function ConnectionField({ configured, keySource, onRefresh }) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function save(event) {
    event.preventDefault()
    if (busy || !value.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/settings/credential', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: value })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to use this key.')
      setValue('')
      setShow(false)
      await onRefresh()
      setMessage({ kind: 'success', text: 'Key loaded for this server session. API access has not yet been verified.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save the key.' })
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/settings/credential', { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to clear the session key.')
      setValue('')
      setShow(false)
      await onRefresh()
      setMessage({ kind: 'success', text: 'Session key cleared. Any private .env key remains available.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to clear the key.' })
    } finally {
      setBusy(false)
    }
  }

  return <form className="apiKeyForm" onSubmit={save}>
    <label htmlFor="apiConnection">API key</label>
    <div className="apiKeyField">
      <KeyRound size={17} aria-hidden="true" />
      <input
        id="apiConnection"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={event => setValue(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        maxLength={512}
        placeholder="Paste an OpenAI API key"
        aria-describedby="api-key-help"
        required
      />
      <button type="button" className="keyReveal" onClick={() => setShow(previous => !previous)}
        aria-label={show ? 'Hide API key' : 'Show API key'} title={show ? 'Hide key' : 'Show key'}>
        {show ? <EyeOff size={17}/> : <Eye size={17}/>}
      </button>
    </div>
    <div className="actions">
      <button className="primary" type="submit" disabled={busy || !value.trim()}>
        {busy ? 'Saving…' : 'Use API key'}
      </button>
      {keySource === 'session' && <button className="outline" type="button" onClick={clear} disabled={busy}>
        <Trash2 size={15}/> Clear session key
      </button>}
    </div>
    <p id="api-key-help" className="helper">Keys entered here stay in this device's running server memory. They are not saved in the browser or GitHub. API usage is billed separately.</p>
    {configured && <p className="keyStatus"><CheckCircle2 size={16}/> {keySource === 'session' ? 'Session key configured' : 'API key configured'} · not yet validated</p>}
    {message && <p className={message.kind === 'error' ? 'keyError' : 'keySuccess'} role="status">{message.text}</p>}
  </form>
}
