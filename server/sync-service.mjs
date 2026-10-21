import 'dotenv/config'
import {createAccountSyncGateway} from './account-sync-gateway.mjs'
const port=Number(process.env.WORKSPACE_SYNC_PORT||3044)
const app=createAccountSyncGateway()
app.listen(port,'127.0.0.1',()=>console.log('Sync gateway ready on loopback'))
