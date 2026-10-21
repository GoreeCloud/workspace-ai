import test from 'node:test'
import assert from 'node:assert/strict'
import {attachChatDocumentRoutes} from '../server/ai-document-routes.mjs'
test('chat file endpoint is origin-protected',async()=>{let handler;attachChatDocumentRoutes({post:(p,h)=>{handler=h}},new Set(['http://127.0.0.1:3031']),{render:async()=>({ok:true})});const response={code:200,status(v){this.code=v;return this},setHeader(){},json(){}};await handler({headers:{origin:'https://not-local.example'},body:{}},response);assert.equal(response.code,403)})
