import {AGENT_MAX_COUNT,normalizeAgents,newAgent} from './agent-model.js'

const TEAM_ROLES=Object.freeze([
 {role:'research',name:'Engineering · Architecture',focus:'Analyze requirements, architecture, dependencies and native platform obligations.'},
 {role:'developer',name:'Engineering · Implementation',focus:'Propose scoped source changes, feature branches and reproducible build steps.'},
 {role:'reviewer',name:'Engineering · Verification',focus:'Develop adversarial tests, security checks, accessibility tests and artifact validation.'},
 {role:'coordinator',name:'Engineering · Coordinator',focus:'Reconcile agent findings, plan next verified actions and identify unresolved blockers.'}
])
export function proposeEngineeringAgentTeam(workspace,order,projectId){
 if(order?.schema!=='goreecloud.engineering-work-order.v1')throw Error('Prepare a valid work order first.')
 if(!Array.isArray(workspace?.projects)||!workspace.projects.some(p=>p.id===projectId))throw Error('Select an existing project for the engineering agents.')
 if(order.projectId!==projectId)throw Error('Work order project changed. Prepare a new work order first.')
 const current=normalizeAgents(workspace.agents||[],workspace.projects)
 if(current.length+TEAM_ROLES.length>AGENT_MAX_COUNT)throw Error('Agent capacity reached.')
 if(current.some(agent=>agent.projectId===projectId&&TEAM_ROLES.some(role=>role.name===agent.name)))
  throw Error('An engineering team already exists in this project. Review the Agents page before adding another.')
 return TEAM_ROLES.map(({role,name,focus})=>{
  const agent=newAgent(projectId,name,role)
  return {...agent,instructions:[
   'GoreeCloud engineering work order: '+order.objective,
   'Repository: '+order.repository+'; target: '+order.target+'.',
   focus,
   'Stay within this project and only analyze, plan, or draft code.',
   'Never claim to have executed tools, compiled apps, deployed services or verified target devices unless there is actual evidence.',
   'Use GoreeCloud canonical instructions, account restriction and native-platform release gates.',
   'External changes require the separate approved execution workflow.'
  ].join('\n').slice(0,4000)}
 })
}
