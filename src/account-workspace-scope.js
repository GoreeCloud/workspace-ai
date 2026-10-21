let activeScope=null
const supported=new Set(['workspace-ai-history-v1','workspace-ai-workspace-v1','workspace-ai-theme','workspace-ai-synced-account-v1'])
export function selectBrowserAccount(scope){if(scope!==null&&(typeof scope!=='string'||!/^[a-f0-9]{24}$/.test(scope)))throw Error('Invalid account identity');activeScope=scope}
export function browserAccountScope(){return activeScope}
export function accountScopedKey(key){if(!supported.has(key))throw Error('Unsupported storage key');return activeScope?'workspace-ai-account-'+activeScope+':'+key:key}
export function scopeFromStatus(status){if(!status||typeof status.connected!=='boolean')throw Error('Invalid status');if(!status.connected)return null;if(typeof status.accountId!=='string'||!/^[a-f0-9]{24}$/.test(status.accountId))throw Error('Unverified identity');return status.accountId}
