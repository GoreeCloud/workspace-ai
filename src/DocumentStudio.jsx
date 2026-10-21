import React,{useState} from 'react'
import {Download,FileCode2,FileSpreadsheet,FileText,FileUp,Plus,RotateCw} from 'lucide-react'
import {BINARY_EXTENSIONS,DOCUMENT_EXTENSIONS,documentKind,encodeBase64,decodeBase64,fileExtension,parseCsv,validDocumentName} from './document-utils.js'
import './document-studio.css'

function download(name,bytes,type='application/octet-stream'){
 const url=URL.createObjectURL(new Blob([bytes],{type}))
 const link=document.createElement('a')
 link.href=url;link.download=name;link.click()
 setTimeout(()=>URL.revokeObjectURL(url),500)
}
function colName(num){let s='';for(let n=num+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function buildModel(extension,content){
 if(extension==='pdf')return {text:content}
 if(extension==='docx')return {paragraphs:content.split(/\n\s*\n/).filter(Boolean)}
 if(extension==='pptx'){
  return {slides:content.split(/^---$/m).filter(s=>s.trim()).map(block=>{const [title,...rest]=block.trim().split('\n');return {title,body:rest.join('\n')}})}
 }
 if(extension==='xlsx'){
  const rows=parseCsv(content,',',60,24)
  return {sheets:[{name:'Sheet1',cells:rows.flatMap((row,r)=>row.map((value,c)=>({address:colName(c)+(r+1),value})))}]}
 }
 throw Error('Unsupported document format.')
}
function mime(ext){
 return {pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 csv:'text/csv',json:'application/json',md:'text/markdown'}[ext]||'text/plain'
}
function newFileName(ext){return 'GoreeCloud-Document.'+ext}
function safeError(error){return error?.message||'Document request failed.'}

export default function DocumentStudio(){
 const [filename,setFilename]=useState('GoreeCloud-Document.md')
 const [source,setSource]=useState('')
 const [mode,setMode]=useState('new')
 const [extension,setExtension]=useState('md')
 const [content,setContent]=useState('')
 const [preview,setPreview]=useState(null)
 const [previewVersion,setPreviewVersion]=useState(0)
 const [changes,setChanges]=useState([])
 const [sheet,setSheet]=useState('')
 const [newCell,setNewCell]=useState({address:'A1',value:''})
 const [pdfAction,setPdfAction]=useState('append')
 const [pdfPage,setPdfPage]=useState(0)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const isBinary=BINARY_EXTENSIONS.includes(extension)

 async function operate(body){
  const response=await fetch('/api/documents/operate',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify(body)})
  const result=await response.json()
  if(!response.ok||result.ok!==true)throw Error(result.error||'Document conversion failed.')
  return result
 }
 async function loadFile(file){
  if(!file)return
  setError('');setNotice('');setPreview(null);setChanges([])
  if(!validDocumentName(file.name))return setError('Unsupported filename or format. Please choose a supported document.')
  const ext=fileExtension(file.name),kind=documentKind(file.name)
  if(file.size>(kind==='binary'?6:2)*1024*1024)return setError('This file exceeds the import limit.')
  setBusy(true)
  try{
   if(kind==='text'){
    const buffer=await file.arrayBuffer()
    const value=new TextDecoder('utf-8',{fatal:true}).decode(buffer)
    setContent(value);setSource('');setMode('open')
   }else{
    const data=encodeBase64(new Uint8Array(await file.arrayBuffer()))
    const parsed=await operate({action:'open',name:file.name,base64:data})
    setContent('');setSource(data);setPreview(parsed.model);setPreviewVersion(v=>v+1);setMode('open')
    setSheet(parsed.model.sheets?.[0]?.name||'')
   }
   setFilename(file.name);setExtension(ext)
   setNotice('File opened. Your original is unchanged; export explicitly to save changes.')
  }catch(e){setError(safeError(e))}
  finally{setBusy(false)}
 }
 function createBlank(ext){
  setFilename(newFileName(ext));setExtension(ext);setMode('new');setContent('');setSource('')
  setPreview(null);setChanges([]);setError('');setNotice('')
 }
 function edit(change){
  setChanges(old=>{
   const id=JSON.stringify(Object.fromEntries(Object.entries(change).filter(([key])=>key!=='text'&&key!=='value')))
   return [...old.filter(item=>JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key])=>key!=='text'&&key!=='value')))!==id),change].slice(-120)
  })
 }
 async function save(){
  if(!validDocumentName(filename)||fileExtension(filename)!==extension)return setError('Filename must have the selected supported extension.')
  setError('');setBusy(true)
  try{
   if(!isBinary){
    if(extension==='json')JSON.parse(content)
    const bytes=new TextEncoder().encode(content)
    if(bytes.length>2*1024*1024)throw Error('Text file exceeds 2 MiB.')
    download(filename,bytes,mime(extension));setNotice('File downloaded; only this device has the exported changes.')
   }else{
    const request=mode==='new'?{action:'create',name:filename,model:buildModel(extension,content)}
      :{action:'edit',name:filename,base64:source,changes}
    if(mode==='open'&&!changes.length)throw Error('Make at least one supported edit before exporting a derivative.')
    const result=await operate(request)
    const editedName=mode==='new'?filename:filename.slice(0,-extension.length-1)+'.edited.'+extension
    download(editedName,decodeBase64(result.base64),mime(extension))
    if(mode==='open'){
     setSource(result.base64);setChanges([])
     const current=await operate({action:'open',name:filename,base64:result.base64})
     setPreview(current.model);setPreviewVersion(v=>v+1)
    }
    setNotice('Document derivative downloaded. Check the file in a native editor before replacing any original.')
   }
  }catch(e){setError(safeError(e))}
  finally{setBusy(false)}
 }
 function viewPdf(){
  if(extension!=='pdf'||!source)return
  const url=URL.createObjectURL(new Blob([decodeBase64(source)],{type:'application/pdf'}))
  window.open(url,'_blank','noopener,noreferrer')
  setTimeout(()=>URL.revokeObjectURL(url),60000)
 }
 const selectedSheet=preview?.sheets?.find(s=>s.name===sheet)||preview?.sheets?.[0]
 return <main className="workspacePage docStudio" aria-label="Documents">
  <div className="workspacePageTop"><div><h1>Documents</h1>
   <p>Create, inspect and edit local files. Originals stay on your device, and content is not automatically sent to the AI model.</p></div>
   <span className="docTag">Local conversion workspace</span></div>
  <div className="documentCapabilities" role="region" aria-label="Document capabilities" tabIndex={0}>
   <div><FileCode2 size={21}/><strong>Source & text</strong><small>Markdown, JSON, CSV, TXT, HTML, code and other text files</small></div>
   <div><FileSpreadsheet size={21}/><strong>Office documents</strong><small>DOCX, XLSX and PPTX creation plus targeted edits</small></div>
   <div><FileText size={21}/><strong>PDF documents</strong><small>Page text preview, text-page creation, append and rotate</small></div>
  </div>
  <section className="docPanel" aria-label="Document setup">
   <div className="docPanelTop"><div><h2>Open or create</h2><p>Select a local file or start a fresh document.</p></div><span className="docTag">{isBinary?'Structured format':'Text format'}</span></div>
   <div className="docActions">
    <label className="outline docUpload"><FileUp size={17}/> Open file
     <input type="file" accept={DOCUMENT_EXTENSIONS.map(ext=>'.'+ext).join(',')} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void loadFile(file)}} disabled={busy}/>
    </label>
    <label>New format<select value={extension} onChange={e=>createBlank(e.target.value)} disabled={busy}>
     {DOCUMENT_EXTENSIONS.map(ext=><option key={ext} value={ext}>{ext.toUpperCase()}</option>)}
    </select></label>
   </div>
   <label className="docFileName">Filename<input value={filename} onChange={e=>setFilename(e.target.value)} maxLength={108} spellCheck={false}/></label>
  </section>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {notice&&<p className="documentNotice" role="status">{notice}</p>}
  <section className="docPanel" aria-label="Document editor">
   <div className="docPanelTop"><div><h2>{mode==='open'?'Opened document':'New document'}</h2>
   <p>{isBinary?'Structured editing. Existing complex formatting is not guaranteed to survive text replacements.':'Edit the source directly; export creates a local copy.'}</p></div>
   <span className="docTag">{extension.toUpperCase()}</span></div>
   {(!isBinary||mode==='new')&&<><label className="docFileName">{isBinary?'Document contents':'Source editor'}
    <textarea value={content} rows={15} onChange={e=>setContent(e.target.value)} spellCheck={false}
     placeholder={extension==='pptx'?'Slide title\nSlide body\n---\nAnother title\nSecond body':
      extension==='xlsx'?'Name,Status\nGoreeCloud,Active':
      extension==='json'?'{\n  "name": "GoreeCloud"\n}':'Write your document…'} maxLength={2_000_000}/></label>
    {mode==='new'&&isBinary&&<p className="documentHint">{extension==='docx'?'Blank lines separate paragraphs.':extension==='pptx'?'Separate slides with --- on its own line. First line is the slide title.':extension==='xlsx'?'Enter a CSV-style grid. Cells become an editable XLSX worksheet.':'Enter text to create a new PDF. Existing PDF text cannot be rewritten in place.'}</p>}
    {(extension==='csv'||extension==='tsv')&&content.length<150000&&<div className="docPreview"><h3>Data preview</h3><div className="docTableWrap"><table><tbody>
     {parseCsv(content,extension==='tsv'?'\t':',',12,12).map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}
    </tbody></table></div></div>}
   </>}
   {mode==='open'&&isBinary&&preview&&<>
    {extension==='docx'&&<div key={previewVersion} className="docFields"><h3>Paragraphs · {preview.paragraphCount}</h3>
     {preview.paragraphs?.slice(0,80).map(p=><label key={p.index}>Paragraph {p.index+1}
      <textarea defaultValue={p.text} rows={2} onChange={e=>edit({target:'paragraph',index:p.index,text:e.target.value})}/></label>)}
     {preview.tables?.map(t=><div key={t.index}><h3>Table {t.index+1}</h3>
      <div className="docTableWrap"><table><tbody>{t.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c}><input aria-label={'Table '+(t.index+1)+' row '+(r+1)+' cell '+(c+1)} defaultValue={cell} onChange={e=>edit({target:'cell',table:t.index,row:r,col:c,text:e.target.value})}/></td>)}</tr>)}</tbody></table></div></div>)}
    </div>}
    {extension==='pptx'&&<div key={previewVersion} className="docFields"><h3>Slides · {preview.slideCount}</h3>{preview.slides?.map(slide=>
     <div className="docSlide" key={slide.index}><strong>Slide {slide.index+1}</strong>
      {slide.shapes.map(shape=><label key={shape.index}>Text element {shape.index+1}
       <textarea defaultValue={shape.text} onChange={e=>edit({target:'shape',slide:slide.index,shape:shape.index,text:e.target.value})} rows={3}/></label>)}
     </div>)}</div>}
    {extension==='xlsx'&&<div key={previewVersion} className="docFields"><label>Worksheet<select value={sheet} onChange={e=>setSheet(e.target.value)}>
     {preview.sheets?.map(s=><option key={s.name}>{s.name}</option>)}</select></label>
     {selectedSheet&&<><p className="documentHint">{selectedSheet.rows} rows, {selectedSheet.columns} columns. Only a bounded preview is displayed; cells outside it are retained.</p>
      <div className="docTableWrap docCells"><table><thead><tr><th>Cell</th><th>Value or formula</th></tr></thead><tbody>
       {selectedSheet.cells.slice(0,130).map(cell=><tr key={cell.address}><th>{cell.address}</th><td><input defaultValue={cell.value} aria-label={'Cell '+cell.address}
        onChange={e=>edit({target:'cell',sheet:selectedSheet.name,address:cell.address,value:e.target.value})}/></td></tr>)}
      </tbody></table></div>
      <div className="docActions"><label>Other cell address<input value={newCell.address} onChange={e=>setNewCell(c=>({...c,address:e.target.value.toUpperCase()}))} maxLength={12}/></label>
       <label>Value<input value={newCell.value} onChange={e=>setNewCell(c=>({...c,value:e.target.value}))} maxLength={1200}/></label>
       <button className="outline" type="button" onClick={()=>{edit({target:'cell',sheet:selectedSheet.name,address:newCell.address,value:newCell.value});setNotice('Cell staged for export.')}}><Plus size={16}/> Stage cell</button></div>
     </>}
    </div>}
    {extension==='pdf'&&<div className="docFields"><h3>Pages · {preview.pageCount}</h3>
     <div className="docActions"><button className="outline" type="button" onClick={viewPdf}><FileText size={16}/> View original PDF</button></div>
     {preview.pages?.slice(0,8).map(page=><details key={page.index}><summary>Page {page.index+1} · rotation {page.rotation}°</summary><pre className="docExtract">{page.text||'No extractable text on this page.'}</pre></details>)}
     <label>Edit operation<select value={pdfAction} onChange={e=>setPdfAction(e.target.value)}><option value="append">Append a text page</option><option value="rotate">Rotate a page</option></select></label>
     {pdfAction==='append'?<label>Text for the appended page<textarea rows={6} value={content} onChange={e=>setContent(e.target.value)} maxLength={12000}/></label>:
      <label>Page number<input type="number" min={1} max={preview.pageCount} value={pdfPage+1} onChange={e=>setPdfPage(Math.max(0,Number(e.target.value)-1))}/></label>}
     <button className="outline" type="button" onClick={()=>{edit(pdfAction==='append'?{target:'append',text:content}:{target:'rotate',index:pdfPage,degrees:90});setNotice('PDF operation staged; export to apply.')}}><RotateCw size={16}/> Stage {pdfAction}</button>
    </div>}
    {preview.notes?.map(note=><p className="documentHint" key={note}>{note}</p>)}
    <p className="documentHint">{changes.length} targeted change(s) staged. The editor exports a new derivative; it does not overwrite your original file.</p>
   </>}
   <div className="docActions"><button className="primary" onClick={save} disabled={busy||!validDocumentName(filename)||(isBinary&&mode==='open'&&!changes.length)}>
    <Download size={17}/>{busy?'Processing…':isBinary&&mode==='open'?'Export edited copy':'Download file'}</button>
    <span className="documentHint">6 MiB Office/PDF import limit · 2 MiB text file limit</span>
   </div>
  </section>
 </main>
}
