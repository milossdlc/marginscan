import { api } from '@appdeploy/client';
import { useEffect, useState } from 'react';

const questions = [
  ['alerts', 'Would you want an alert when a Strong Move appears?', ['Yes', 'Maybe', 'No']],
  ['clarity', 'How clearly do you understand what MarginScan does?', ['1 — Not clear', '2', '3', '4', '5 — Very clear']],
  ['signalClarity', 'How easy was the signal to understand?', ['1 — Very difficult', '2', '3', '4', '5 — Very easy', 'No signal reviewed']],
  ['usefulness', 'Did it help you decide what to review next?', ['Yes', 'Partly', 'No', 'Not enough information']],
  ['frequency', 'How often would you use it?', ['Daily', 'Several times a week', 'Occasionally', 'Never', 'Unsure']],
  ['pay', 'Would you pay for advanced features?', ['No', 'Maybe', 'Yes', 'Too early to say']],
  ['mode', 'Which data did you review?', ['Demo', 'Live', 'Both', 'Unsure']],
  ['outcome', 'How far did you get?', ['Reviewed a signal', 'Compared movement timelines', 'No matching movements', 'Could not complete the flow', 'Checked bookmaker odds', 'No actionable signals']]
] as const;
export default function BetaReadiness({userId,onSignIn}:{userId:string|null;onSignIn:()=>void}) {
  const [open,setOpen]=useState(false);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [loadError,setLoadError]=useState(false);
  const [retry,setRetry]=useState(0);
  const [started,setStarted]=useState(false);
  useEffect(()=>{let active=true;if(!userId||!started)return;setMessage('');setLoadError(false);setLoading(true);api.get('/api/beta/questionnaire').then(r=>{if(active&&r.data.response){setAnswers(r.data.response.answers);setMessage('Your saved feedback is loaded. You can update it.')}}).catch(()=>{if(active)setLoadError(true)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[userId,started,retry]);
  async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setMessage('');try{await api.post('/api/beta/questionnaire',{answers,schemaVersion:2});setMessage('Feedback saved. Thank you — you can update your answers anytime.')}catch{setMessage('Feedback could not be saved. Your answers are still here. Please try again.')}finally{setSaving(false)}}
  return <section className='faqcard beta-readiness'><h2>Your first five minutes</h2><p>MarginScan tracks significant price changes and separates meaningful movements from noise. Explore three demo movements, then tell us whether this information would be useful every day.</p><details><summary>Open tester guide</summary><ol><li>Market Lab research examples are simulated and marked Demo. Sharp Scanner separately shows Pinnacle observations collected through an external odds data provider every 5 minutes; prices may be delayed.</li><li>Open a Strong Move and inspect its opening price, current price and timeline.</li><li>Compare an Early movement and a Filtered example in Market Lab under All movements. Score ranks the size and speed of the change, not the chance of winning.</li><li>Save a movement to the device-local watchlist. Automatic alerts are not enabled.</li><li>Sign in to save feedback. No deposit, bet or subscription is needed.</li></ol></details><button className='primary' aria-expanded={open} onClick={()=>{setStarted(true);setOpen(!open)}}>{open?'Close questionnaire':'Beta feedback questionnaire'}</button>{open&&<div><h3>Tell us what happened</h3><p>Answers are stored with your signed-in account for product research. Do not include passwords, account balances or personal details in free text. This is optional and does not start a subscription.</p>{!userId?<button className='primary' onClick={onSignIn}>Sign in to save feedback</button>:loading?<p role='status'>Loading your feedback…</p>:loadError?<div role='alert'><p>Saved feedback could not be loaded.</p><button onClick={()=>setRetry(x=>x+1)}>Retry loading feedback</button></div>:<form onSubmit={save}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:18,minWidth:0}}>{questions.map(([key,label,options])=><label key={key}>{label}<select required value={answers[key]||''} onChange={e=>setAnswers(a=>({...a,[key]:e.target.value}))}><option value=''>Choose an answer</option>{options.map(o=><option key={o}>{o}</option>)}</select></label>)}<label>In your own words, what does MarginScan do?<textarea required maxLength={1500} value={answers.understanding||''} onChange={e=>setAnswers(a=>({...a,understanding:e.target.value}))}/></label><label>What information or feature was missing? (optional)<textarea maxLength={1500} value={answers.missing||''} onChange={e=>setAnswers(a=>({...a,missing:e.target.value}))}/></label><label>What monthly price in EUR would feel acceptable? (optional)<input type='number' min='0' max='1000' step='0.01' value={answers.price||''} onChange={e=>setAnswers(a=>({...a,price:e.target.value}))}/></label><label>Which feature would you pay for: real-time alerts, more sources, history or advanced filters? (optional)<textarea maxLength={1500} value={answers.feature||''} onChange={e=>setAnswers(a=>({...a,feature:e.target.value}))}/></label><button className='primary' disabled={saving}>{saving?'Saving…':'Save beta feedback'}</button></fieldset><p role='status'>{message}</p></form>}</div>}</section>
}

