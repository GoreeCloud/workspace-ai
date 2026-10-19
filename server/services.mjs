export const SERVICES = [
  {id:'todoist',name:'Todoist',category:'Productivity',kind:'api',auth:'token',icon:'list-todo'},
  {id:'google-drive',name:'Google Drive',category:'Files',kind:'api',auth:'oauth',icon:'hard-drive'},
  {id:'dropbox',name:'Dropbox',category:'Files',kind:'api',auth:'token',icon:'box'},
  {id:'linear',name:'Linear',category:'Development',kind:'api',auth:'token',icon:'workflow'},
  {id:'remote-desktop-commander',name:'Remote Desktop Commander',category:'Administration',kind:'mcp',auth:'mcp',icon:'monitor'},
  {id:'tinyfish',name:'TinyFish',category:'Automation',kind:'mcp',auth:'mcp',icon:'fish'},
  {id:'gmail',name:'Gmail',category:'Communications',kind:'api',auth:'oauth',icon:'mail'},
  {id:'firecrawl',name:'Firecrawl',category:'Research',kind:'mcp',auth:'mcp',icon:'flame'},
  {id:'github',name:'GitHub',category:'Development',kind:'api',auth:'token',icon:'github'},
  {id:'cloudflare-pages',name:'Cloudflare Pages',category:'Deployment',kind:'api',auth:'token',icon:'cloud'}
]
export const byId = id => SERVICES.find(service=>service.id===id)
