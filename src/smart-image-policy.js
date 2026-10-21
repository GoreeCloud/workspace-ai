export const IMAGE_MODEL_CHOICES=[{id:'auto',label:'Smart (Auto)'},{id:'ideogram-4-5',label:'Ideogram 4.5'},{id:'gpt-image-2-5',label:'GPT Image 2.5'},{id:'nano-banana-2-1',label:'Nano Banana 2.1'}]
export const IMAGE_RATIOS=['auto','1:1','16:9','9:16','4:3','3:4'];
export const IMAGE_PRIORITIES=['balanced','speed','quality'];
export function chooseImageModel({prompt,model='auto',priority='balanced'}={}){
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>10000)throw Error('Enter a valid image description.');
 if(!IMAGE_MODEL_CHOICES.some(m=>m.id===model))throw Error('Unsupported model.');
 if(!IMAGE_PRIORITIES.includes(priority))throw Error('Unsupported priority.');
 if(model!=='auto')return {selected:model,automatic:false,reason:'Manual model lock: no substitutions.'};
 const p=prompt.toLowerCase();
 let selected='ideogram-4-5',reason='General image; Ideogram default.';
 if(/transparent|alpha channel|cutout|no background/.test(p)){selected='gpt-image-2-5';reason='Transparency request.'}
 else if(/logo|typography|lettering|wordmark|poster|headline|signage/.test(p)){selected='ideogram-4-5';reason='Branding and image text.'}
 else if(/character consistency|storyboard|diagram|infographic|manga|comic panel/.test(p)){selected='nano-banana-2-1';reason='Character or explanatory art.'}
 else if(/photoreal|portrait|cinematic|photograph|product photography/.test(p)){selected='gpt-image-2-5';reason='Photorealism.'}
 else if(priority==='speed'){selected='nano-banana-2-1';reason='Speed priority.'}
 return {selected,automatic:true,reason};
}
export function normalizeImageRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid request.');
 const {prompt,model='auto',priority='balanced',aspectRatio='auto',numImages=1}=body;
 if(!IMAGE_RATIOS.includes(aspectRatio))throw Error('Unsupported aspect ratio.');
 if(!Number.isSafeInteger(numImages)||numImages<1||numImages>4)throw Error('Choose 1–4 images.');
 const route=chooseImageModel({prompt,model,priority});
 return {prompt:prompt.trim(),model,priority,aspectRatio,numImages,route};
}
export function providerModelFor(item){const model=item?.route?.selected;if(model==='ideogram-4-5'||model==='nano-banana-2-1')return model;if(model==='gpt-image-2-5')return item.priority==='speed'?'gpt-image-2-5-flare':'gpt-image-2-5-sunburst';throw Error('Unsupported image route.');}
