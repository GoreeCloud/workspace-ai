// User-owned images are accepted for direct API model requests only. No
// automatic plan fallback or MCP invocation is permitted for visual inputs.
const MAX_IMAGE_COUNT=2
const MAX_IMAGE_CHARS=180000
export function validateChatImages(value){
 if(value===undefined||value===null)return []
 if(!Array.isArray(value)||value.length>MAX_IMAGE_COUNT)return null
 const items=[]
 for(const input of value){
  if(typeof input!=='string'||input.length>MAX_IMAGE_CHARS)return null
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input)
  if(!match)return null
  let binary
  try{binary=Buffer.from(match[2],'base64')}catch{return null}
  if(binary.length<32||binary.length>140000)return null
  const jpeg=match[1]==='jpeg'&&binary[0]===255&&binary[1]===216&&binary[2]===255
  const png=match[1]==='png'&&binary.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const webp=match[1]==='webp'&&binary.toString('ascii',0,4)==='RIFF'&&binary.toString('ascii',8,12)==='WEBP'
  if(!jpeg&&!png&&!webp)return null
  items.push(input)
 }
 return items
}
export function multimodalChatInput(messages,images){
 if(!Array.isArray(messages)||!messages.length||messages.at(-1).role!=='user')throw Error('Invalid visual conversation')
 if(!Array.isArray(images)||images.length>MAX_IMAGE_COUNT)throw Error('Invalid image input')
 if(!images.length)return messages
 return messages.map((m,i)=>i===messages.length-1?{
  ...m,content:[{type:'input_text',text:m.content},...images.map(image_url=>({type:'input_image',image_url,detail:'auto'}))]
 }:m)
}
