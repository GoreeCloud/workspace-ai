export const SERVICES = [
  {id:'todoist',name:'Todoist',category:'Productivity',kind:'api',auth:'token',icon:'list-todo'},
  {id:'google-drive',name:'Google Drive',category:'Files',kind:'api',auth:'oauth',icon:'hard-drive'},
  {id:'dropbox',name:'Dropbox',category:'Files',kind:'api',auth:'token',icon:'box'},
  {id:'linear',name:'Linear',category:'Development',kind:'api',auth:'token',icon:'workflow'},
  {id:'remote-desktop-commander',name:'Remote Desktop Commander',category:'Administration',kind:'mcp',auth:'mcp',icon:'monitor'},
  {id:'gmail',name:'Gmail',category:'Communications',kind:'api',auth:'oauth',icon:'mail'},
  {id:'firecrawl',name:'Firecrawl',category:'Research',kind:'mcp',auth:'mcp',icon:'flame'},
  {id:'github',name:'GitHub',category:'Development',kind:'api',auth:'token',icon:'github'},
  {id:'cloudflare-pages',name:'Cloudflare Pages',category:'Deployment',kind:'api',auth:'token',icon:'cloud'},
  {id:'todoist-mcp',name:'Todoist MCP',category:'Productivity',kind:'mcp',auth:'mcp',icon:'list-todo'},
  {id:'google-drive-mcp',name:'Google Drive MCP',category:'Files',kind:'mcp',auth:'mcp',icon:'hard-drive'},
  {id:'gmail-mcp',name:'Gmail MCP',category:'Communications',kind:'mcp',auth:'mcp',icon:'mail'},
  {id:'github-mcp',name:'GitHub MCP',category:'Development',kind:'mcp',auth:'mcp',icon:'github'},
  {id:'dropbox-mcp',name:'Dropbox MCP',category:'Files',kind:'mcp',auth:'mcp',icon:'box'},
  {id:'linear-mcp',name:'Linear MCP',category:'Development',kind:'mcp',auth:'mcp',icon:'workflow'},
  {id:'notion-mcp',name:'Notion MCP',category:'Knowledge',kind:'mcp',auth:'mcp',icon:'book'}
]
export const byId = id => SERVICES.find(service=>service.id===id)
