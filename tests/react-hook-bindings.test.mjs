import test from 'node:test'
import assert from 'node:assert/strict'
import {readdir,readFile} from 'node:fs/promises'
test('all JSX React hooks are imported',async()=>{
 const dir=new URL('../src/',import.meta.url)
 const errors=[]
 const hooks=['useState','useEffect','useRef','useMemo','useCallback']
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.jsx'))){
  const source=await readFile(new URL(name,dir),'utf8')
  const imports=source.split('\n').filter(line=>line.startsWith('import ')&&line.includes("'react'")).join(' ')
  for(const hook of hooks){
   if(source.includes(hook+'(')&&!imports.includes(hook))errors.push(name+': '+hook)
  }
 }
 assert.deepEqual(errors,[])
})
