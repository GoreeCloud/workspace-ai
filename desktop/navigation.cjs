'use strict'
function allowedLocalNavigation(target,port){
 try{const u=new URL(target);return u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port===String(port)&&!u.username&&!u.password}catch{return false}
}
function externalAuthenticationLink(target){
 try{const u=new URL(target);return u.protocol==='https:'&&u.hostname==='auth.openai.com'&&!u.username&&!u.password?u.href:null}catch{return null}
}
module.exports={allowedLocalNavigation,externalAuthenticationLink}
