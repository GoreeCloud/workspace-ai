// Deterministic, exportable engineering plans. This does not initiate code execution.
export const DELIVERY_TARGETS=['web','android','linux','windows','ios','ipados','macos','server','cross-platform']
export const BUILD_PHASES=Object.freeze([
 {id:'requirements',title:'Requirements & threat model',gate:'Owner policy and scope requirements captured'},
 {id:'architecture',title:'Architecture & dependencies',gate:'Platform-native design reviewed and dependency licences checked'},
 {id:'implementation',title:'Isolated implementation',gate:'Reproducible source changes committed to GoreeCloud feature branches'},
 {id:'test',title:'Automated tests',gate:'Unit, integration, negative-path and data-isolation checks passed'},
 {id:'security',title:'Security & privacy review',gate:'Permissions, secrets handling and supply-chain audit passed'},
 {id:'native',title:'Target platform build',gate:'Actual native package and OS integration verified; web wrappers do not qualify'},
 {id:'ux',title:'UX and accessibility QA',gate:'Representative screenshots, interactions and accessibility checks verified'},
 {id:'release',title:'Candidate verification',gate:'Artifact hashes, reproducible build, CI, rollback and authorized release decision'}
])
export function createEngineeringWorkOrder(value={}){
 const goal=String(value.goal||'').trim()
 const repo=String(value.repository||'').trim()
 const target=String(value.target||'').trim()
 const project=String(value.project||'').trim()
 const projectId=value.projectId||null
 if(projectId!==null&&!/^[A-Za-z0-9_-]{1,100}$/.test(projectId))throw Error('Invalid project identifier.')
 if(goal.length<12||goal.length>2000)throw Error('Describe the engineering objective (12–2000 characters).')
 if(!/^GoreeCloud\/[a-zA-Z0-9_.-]{1,100}$/.test(repo)||repo.endsWith('/.')||repo.endsWith('/..'))throw Error('Use a GoreeCloud-owned repository such as GoreeCloud/workspace-ai.')
 if(!DELIVERY_TARGETS.includes(target))throw Error('Select a supported delivery target.')
 if(project.length>100)throw Error('Project label is too long.')
 const safety=value.safety===true
 return {
  schema:'goreecloud.engineering-work-order.v1',
  project:project||'Workspace AI',projectId,repository:repo,target,objective:goal,
  mode:'plan-only',automation:'requires-reviewed-execution-bridge',
  limits:{parallelAgents:4,allowWrites:false,allowDeployment:false,requiresAuthorizedIdentity:'GoreeCloud',requiresVerifiedArtifacts:true},
  phases:BUILD_PHASES.map(phase=>({...phase,status:'pending'})),
  roles:[
   {role:'Architecture',responsibility:'Define implementation and tests'},
   {role:'Implementation',responsibility:'Design reviewed source changes on isolated branches'},
   {role:'Verification',responsibility:'Build, test, review security and validate artifacts'},
   {role:'Coordinator',responsibility:'Cross-check project requirements and report evidence'}
  ],
  notes:[safety?'Additional high-risk authorization review required':'Standard GoreeCloud engineering safeguards apply',
   'No autonomous changes, commands or deployments are performed by this work order.',
   'Native platform acceptance requires actual target OS build and runtime evidence.']
 }
}
export function workOrderPrompt(order){
 if(order?.schema!=='goreecloud.engineering-work-order.v1')throw Error('Invalid work order.')
 return ['Prepare an implementation plan for the following GoreeCloud development work.',
  'Only use the authorized GoreeCloud GitHub account. Review the master operating instructions first.',
  'Repository: '+order.repository,'Target: '+order.target,'Objective: '+order.objective,
  'Use distinct architecture, implementation, verification and coordinator roles.',
  'Perform only currently authorized operations; require approvals for consequential changes.',
  'Confirm native build and test evidence before calling anything released.',
  ...order.phases.map((phase,i)=>String(i+1)+'. '+phase.title+' — '+phase.gate)].join('\n')
}
