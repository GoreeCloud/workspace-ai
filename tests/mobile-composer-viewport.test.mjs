import test from 'node:test'
import assert from 'node:assert/strict'
import {mobileComposerHeight,installMobileComposerViewport} from '../src/mobile-composer-viewport.js'

test('mobile composer height follows visible keyboard-adjusted viewport', () => {
  assert.equal(mobileComposerHeight({width:390,focused:true,height:430,top:0}),'430px')
  assert.equal(mobileComposerHeight({width:390,focused:true,height:430.4,top:11.2}),'442px')
  assert.equal(mobileComposerHeight({width:1024,focused:true,height:430}),null)
  assert.equal(mobileComposerHeight({width:390,focused:false,height:430}),null)
  assert.equal(mobileComposerHeight({width:390,focused:true,height:0}),null)
})

test('viewport listener restores document height after blur and unmount', () => {
  const listeners = new Map()
  const target = name => ({
    addEventListener: (event, handler) => listeners.set(name + ':' + event, handler),
    removeEventListener: (event) => listeners.delete(name + ':' + event),
  })
  const properties = new Map()
  const viewport = {...target('visual'), height:410, offsetTop:0}
  const win = {...target('window'), innerWidth:393, visualViewport:viewport}
  let focused = true
  const doc = {
    ...target('document'),
    activeElement: {closest: () => focused ? {} : null},
    documentElement: {style: {
      setProperty: (name,value) => properties.set(name,value),
      removeProperty: name => properties.delete(name),
    }},
  }
  const dispose = installMobileComposerViewport(win,doc)
  const key = '--gc-mobile-composer-viewport-height'
  assert.equal(properties.get(key),'410px')
  viewport.height = 350
  listeners.get('visual:resize')()
  assert.equal(properties.get(key),'350px')
  focused = false
  listeners.get('document:focusout')()
  assert.equal(properties.has(key),false)
  dispose()
  assert.equal(listeners.size,0)
})
