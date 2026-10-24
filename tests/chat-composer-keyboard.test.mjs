import test from 'node:test'
import assert from 'node:assert/strict'
import {shouldSendOnComposerEnter} from '../src/chat-composer-keyboard.js'

const enter = overrides => ({key:'Enter',shiftKey:false,isComposing:false,...overrides})

test('desktop Enter submits, while Shift+Enter inserts multiline text', () => {
  assert.equal(shouldSendOnComposerEnter(enter()),true)
  assert.equal(shouldSendOnComposerEnter(enter({shiftKey:true})),false)
  assert.equal(shouldSendOnComposerEnter({key:'a'}),false)
})

test('Android and touch keyboard Enter inserts a newline instead of submitting', () => {
  assert.equal(shouldSendOnComposerEnter(enter(),{mobileViewport:true}),false)
  assert.equal(shouldSendOnComposerEnter(enter(),{coarsePointer:true}),false)
  assert.equal(shouldSendOnComposerEnter(enter(),{mobileViewport:false,coarsePointer:false}),true)
})

test('IME composition and synthetic keycode 229 never submit unfinished text', () => {
  assert.equal(shouldSendOnComposerEnter(enter({isComposing:true})),false)
  assert.equal(shouldSendOnComposerEnter(enter({nativeEvent:{isComposing:true}})),false)
  assert.equal(shouldSendOnComposerEnter(enter({keyCode:229})),false)
})
