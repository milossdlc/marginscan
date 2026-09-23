import type {LiveSignal} from './LocalComparison';
export function openingOdds(signal:LiveSignal){return signal.opening?.odds??signal.fromOdds}
export function currentOdds(signal:LiveSignal){return signal.current?.odds??signal.toOdds}
export function currentDrop(signal:LiveSignal){return (openingOdds(signal)-currentOdds(signal))/openingOdds(signal)*100}
export function marketLabel(signal:LiveSignal){return signal.identity?.marketType==='totals'?'Over/Under · FT':'1X2 · FT'}
export function uniqueMoves(items:LiveSignal[]){return [...new Map([...items].sort((a,b)=>b.detectedAt-a.detectedAt).map(item=>[item.identity?JSON.stringify([item.fixtureId,item.identity.marketType,item.identity.period,item.identity.selectionKey,item.identity.line]):item.key||item.id||item.fixtureId+'|'+item.selection,item] as const).reverse()).values()]}
export function openingDrop(signal:LiveSignal){const opening=openingOdds(signal);return opening>1?((opening-signal.toOdds)/opening)*100:0}
export function closingOdds(signal:LiveSignal){
 const close=signal.closing,kickoff=signal.commenceTime;
 if(close?.status!=='calculated'||!kickoff||!close.odds||!Number.isFinite(close.odds)||close.odds<=1||!close.observedAt||!close.providerUpdatedAt)return null;
 if(close.line!==(signal.identity?.line??null))return null;
 if(close.observedAt<kickoff-600000||close.observedAt>=kickoff||close.observedAt<(signal.signalTimestamp||signal.detectedAt))return null;
 if(close.providerUpdatedAt<kickoff-600000||close.providerUpdatedAt>=kickoff)return null;
 return close.odds;
}
export function openingToClose(signal:LiveSignal){const close=closingOdds(signal),opening=openingOdds(signal);return close&&opening>1?((opening-close)/opening)*100:null}
export function impliedDelta(signal:LiveSignal){const close=closingOdds(signal),opening=openingOdds(signal);return close&&opening>1?((1/close)-(1/opening))*100:null}
export function pathLabel(signal:LiveSignal){const close=closingOdds(signal);if(!close)return ['unavailable','calculated'].includes(signal.closing?.status||'')?'Unavailable':'Pending';if(close<signal.toOdds-0.005)return 'Continued';if(close>signal.toOdds+0.005)return 'Reversed';return 'Flat'}
export function strength(signal:LiveSignal){const move=openingToClose(signal)??openingDrop(signal);return move>=15?'Strong':move>=10?'Notable':'Watch'}
