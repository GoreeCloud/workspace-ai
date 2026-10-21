export const TEXT_EXTENSIONS=Object.freeze(['md','markdown','txt','json','csv','tsv','html','css','js','jsx','ts','tsx','py','yaml','yml','xml','sql','log'])
export const BINARY_EXTENSIONS=Object.freeze(['docx','pptx','xlsx','pdf'])
export const DOCUMENT_EXTENSIONS=Object.freeze([...TEXT_EXTENSIONS,...BINARY_EXTENSIONS])
export function fileExtension(name){
 if(typeof name!=='string'||!name.includes('.'))return ''
 return name.slice(name.lastIndexOf('.')+1).toLowerCase()
}
export function validDocumentName(name){
 return typeof name==='string'&&name.length<=108&&
 /^[a-zA-Z0-9][a-zA-Z0-9 _.()\-]*\.[a-zA-Z0-9]{2,8}$/.test(name)&&DOCUMENT_EXTENSIONS.includes(fileExtension(name))
}
export function documentKind(name){
 const extension=fileExtension(name)
 if(!validDocumentName(name))return null
 return BINARY_EXTENSIONS.includes(extension)?'binary':'text'
}
export function decodeBase64(data){
 const binary=atob(data)
 const bytes=new Uint8Array(binary.length)
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
 return bytes
}
export function encodeBase64(bytes){
 let parts=[]
 for(let i=0;i<bytes.length;i+=0x6000){
  const slice=bytes.subarray(i,i+0x6000)
  parts.push(String.fromCharCode(...slice))
 }
 return btoa(parts.join(''))
}
export function parseCsv(text,delimiter=',',maxRows=100,maxColumns=24){
 if(typeof text!=='string'||text.length>2_000_000)throw Error('CSV file exceeds preview limit')
 const rows=[]
 let row=[],field='',quoted=false,i=0
 while(i<text.length&&rows.length<maxRows){
  const ch=text[i]
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){field+='"';i+=2;continue}
   if(ch==='"'){quoted=false;i++;continue}
   field+=ch;i++;continue
  }
  if(ch==='"'&&field===''){quoted=true;i++;continue}
  if(ch===delimiter){row.push(field);field='';i++;continue}
  if(ch==='\n'||ch==='\r'){
   row.push(field)
   rows.push(row.slice(0,maxColumns))
   row=[];field='';i+=ch==='\r'&&text[i+1]==='\n'?2:1;continue
  }
  field+=ch;i++
 }
 if(row.length||field||text.length&&!rows.length){row.push(field);rows.push(row.slice(0,maxColumns))}
 return rows
}
