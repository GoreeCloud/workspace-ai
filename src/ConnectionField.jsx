import React, { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, CheckCircle2, Trash2, ShieldAlert, RefreshCw, CircleHelp } from 'lucide-react'

export default function ConnectionField({ configured, keySource, verification, onRefresh, providerEgressStatus = 'local' }) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const messageRef = useRef(null)
  useEffect(() => { if (message) messageRef.current?.scrollIntoView({ block: 'nearest' }) }, [message])
  const egressBlocked = providerEgressStatus === 'disabled'
  const hosted = providerEgressStatus !== 'local'
  const state = egressBlocked ? 'network-disabled' : configured ? (verification?.state || 'untested') : 'missing'
  const statusText = {
    verified: 'OpenAI accepted this key for model listing.',
    invalid: 'OpenAI rejected this key.',
    restricted: 'Model-list access is restricted.',
    unavailable: 'Verification unavailable. You can retry.',
    untested: 'Key saved. Connection not yet checked.',
    missing: 'Add an API key to enable this connection.',
    'network-disabled': 'Outbound OpenAI access is disabled on this private preview.'
  }[state]
  const indicator = state === 'verified' ? <CheckCircle2 size={16} /> :
    state === 'invalid' || state === 'restricted' ? <ShieldAlert size={16} /> : <CircleHelp size={16} />

  async function validateConnection() {
    const response = await fetch('/api/settings/credential/verify', { method: 'POST' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not verify the API key.')
    await onRefresh()
    setMessage({ kind: result.verification?.state === 'verified' ? 'success' : 'error', text: result.message })
  }

  async function save(event) {
    event.preventDefault()
    if (busy || egressBlocked || !value.trim()) return
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
      await validateConnection()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save or verify the key.' })
    } finally {
      setBusy(false)
    }
  }

  async function verifyAgain() {
    if (busy || egressBlocked) return
    setBusy(true)
    setMessage(null)
    try { await validateConnection() }
    catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Connection check failed.' }) }
    finally { setBusy(false) }
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
    } finally { setBusy(false) }
  }

  return <form className="apiKeyForm" onSubmit={save}>
    {egressBlocked && <p id="api-egress-notice" className="privacyInfo" role="status">This private preview cannot reach OpenAI. Its restricted provider connection must be enabled by the administrator before a key can be verified or API chats can work. Adding a key alone will not fix the network route.</p>}
    <label htmlFor="apiConnection">API key</label>
    <div className="apiKeyField">
      <KeyRound size={17} aria-hidden="true" />
      <input
        id="apiConnection" type={show ? 'text' : 'password'} value={value}
        onChange={event => setValue(event.target.value)}
        autoComplete="off" spellCheck={false} maxLength={512} disabled={egressBlocked || busy}
        placeholder="Paste an OpenAI API key" aria-describedby={egressBlocked ? 'api-egress-notice api-key-help' : 'api-key-help'} required
      />
      <button type="button" className="keyReveal" disabled={egressBlocked || busy} onClick={() => setShow(previous => !previous)}
        aria-label={show ? 'Hide API key' : 'Show API key'} title={show ? 'Hide key' : 'Show key'}>
        {show ? <EyeOff size={17}/> : <Eye size={17}/>}
      </button>
    </div>
    <div className="actions">
      <button className="primary" type="submit" disabled={egressBlocked || busy || !value.trim()}>
        {busy ? 'Checking…' : 'Use API key'}
      </button>
      {configured && <button className="outline" type="button" onClick={verifyAgain} disabled={egressBlocked || busy}>
        <RefreshCw size={15}/> Verify connection
      </button>}
      {keySource === 'session' && <button className="outline" type="button" onClick={clear} disabled={busy}>
        <Trash2 size={15}/> Clear session key
      </button>}
    </div>
    <p id="api-key-help" className="helper">{hosted ? 'A hosted preview session key is held in shared server memory until restart, not in this browser. Do not use this preview as a multi-user credential store. ' : 'A session key stays in the local server process until restart. '}Verification checks the model list without paid inference; API chats are billed separately.</p>
    <p className={'keyVerification keyVerification-' + state} role="status">
      {indicator}<span>{statusText}</span>
    </p>
    {message && <p ref={messageRef} className={message.kind === 'error' ? 'keyError' : 'keySuccess'} role="status">{message.text}</p>}
  </form>
}
