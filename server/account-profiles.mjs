import {createHash} from 'node:crypto'
export const MAX_SAVED_ACCOUNTS=5
export function accountId(subject){
 if(typeof subject!=='string'||!subject.trim()||subject.length>512)throw Error('Invalid account identity')
 return createHash('sha256').update(subject).digest('hex').slice(0,24)
}
const validAccount=a=>a&&typeof a.subject==='string'&&a.subject.trim()&&typeof a.client_id==='string'&&a.client_id.trim()
export function accountEntries(profile){
 const source=Array.isArray(profile?.accounts)?profile.accounts:(validAccount(profile?.account)&&profile.account.access_token?[profile.account]:[])
 const unique=new Map()
 for(const entry of source)if(validAccount(entry)&&!unique.has(entry.subject))unique.set(entry.subject,entry)
 return [...unique.values()].slice(0,MAX_SAVED_ACCOUNTS)
}
export function publicAccounts(profile){
 const active=profile?.account?.access_token?profile.account?.subject:null
 return accountEntries(profile).map(item=>({accountId:accountId(item.subject),email:typeof item.email==='string'?item.email:null,active:item.subject===active,connected:Boolean(item.access_token)}))
}
export function activeAccountId(profile){return profile?.account?.access_token&&validAccount(profile.account)?accountId(profile.account.subject):null}
export function rememberAccount(profile,account){
 if(!validAccount(account)||typeof account.access_token!=='string'||!account.access_token)throw Error('Verified account credentials required')
 const items=accountEntries(profile),existing=items.findIndex(a=>a.subject===account.subject)
 if(existing<0&&items.length>=MAX_SAVED_ACCOUNTS)throw Error('Maximum of five saved accounts reached')
 if(existing>=0)items[existing]=account;else items.push(account)
 return {...profile,accounts:items,active_subject:account.subject,account}
}
export function selectAccount(profile,id){
 if(id===null)return {...profile,accounts:accountEntries(profile),active_subject:null,account:undefined}
 if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))throw Error('Invalid account selection')
 const items=accountEntries(profile),account=items.find(a=>accountId(a.subject)===id)
 if(!account?.access_token)throw Error('Saved account requires sign-in')
 return {...profile,accounts:items,active_subject:account.subject,account}
}
export function removeAccount(profile,subject){
 if(typeof subject!=='string'||!subject)throw Error('Account identity required')
 return {...profile,accounts:accountEntries(profile).filter(a=>a.subject!==subject),
  active_subject:profile.account?.subject===subject?null:profile.active_subject,
  account:profile.account?.subject===subject?undefined:profile.account}
}
export function refreshSavedAccount(profile,old,newAccount){
 if(newAccount?.subject!==old.subject||newAccount?.client_id!==old.client_id||
    profile.account?.subject!==old.subject||profile.account?.client_id!==old.client_id||
    profile.account?.refresh_token!==old.refresh_token)return profile
 const items=accountEntries(profile).map(a=>a.subject===old.subject?newAccount:a)
 return {...profile,accounts:items,account:newAccount}
}
