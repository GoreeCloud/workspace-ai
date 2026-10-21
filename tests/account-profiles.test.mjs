import test from 'node:test'
import assert from 'node:assert/strict'
import {accountId,accountEntries,rememberAccount,publicAccounts,selectAccount,removeAccount,refreshSavedAccount,MAX_SAVED_ACCOUNTS} from '../server/account-profiles.mjs'
const make=n=>({subject:'user-'+n,client_id:'oaiapp_synthetic',email:n+'@example.test',access_token:'synthetic-access-'+n,refresh_token:'synthetic-refresh-'+n})
test('saved identities can switch without exposing tokens in the account chooser',()=>{
 const first=make(1),second=make(2)
 const accounts=rememberAccount(rememberAccount({},first),second)
 assert.equal(accounts.account.subject,second.subject)
 assert.deepEqual(accountEntries(accounts).map(a=>a.subject),[first.subject,second.subject])
 assert.deepEqual(publicAccounts(accounts).map(a=>a.active),[false,true])
 assert.doesNotMatch(JSON.stringify(publicAccounts(accounts)),/synthetic-access|synthetic-refresh/)
 assert.equal(selectAccount(accounts,accountId(first.subject)).account.subject,first.subject)
 assert.equal(selectAccount(selectAccount(accounts,null),accountId(second.subject)).account.subject,second.subject)
})
test('signout removes only the active connection, not all other accounts',()=>{
 let p=rememberAccount(rememberAccount({},make(1)),make(2))
 p=removeAccount(p,'user-2')
 assert.equal(p.account,undefined)
 assert.deepEqual(p.accounts.map(a=>a.subject),['user-1'])
 assert.throws(()=>selectAccount(p,accountId('user-2')),/Saved account requires sign-in/)
})
test('stale OAuth refresh cannot overwrite a switched account',()=>{
 const p=rememberAccount(rememberAccount({},make(1)),make(2))
 const newer={...make(2),access_token:'new-access'}
 assert.equal(refreshSavedAccount(p,make(2),newer).account.access_token,'new-access')
 assert.equal(refreshSavedAccount(p,make(1),make(1)),p)
 assert.equal(refreshSavedAccount(p,make(2),make(1)),p)
})
test('bounded account registry preserves a legacy verified session',()=>{
 assert.deepEqual(accountEntries({account:{subject:'user',client_id:'client'}}),[])
 assert.equal(accountEntries({account:make(1)}).length,1)
 let p={}
 for(let n=0;n<MAX_SAVED_ACCOUNTS;n++)p=rememberAccount(p,make(n))
 assert.throws(()=>rememberAccount(p,make(6)),/Maximum of five/)
 assert.throws(()=>selectAccount(p,'not-valid'),/Invalid account selection/)
})
