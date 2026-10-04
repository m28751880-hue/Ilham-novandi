import crypto from 'crypto';

const BASE = process.env.BINANCE_BASE_URL || 'https://fapi.binance.com';
const KEY = process.env.BINANCE_API_KEY || '';
const SECRET = process.env.BINANCE_API_SECRET || '';
const ALLOW_LIVE = String(process.env.ALLOW_LIVE_TRADING || 'false').toLowerCase() === 'true';
const MAX_RISK_PCT = Number(process.env.MAX_RISK_PCT || 1);

function sign(params) {
  return crypto.createHmac('sha256', SECRET).update(new URLSearchParams(params).toString()).digest('hex');
}
async function binance(path, { method='GET', params={}, signed=false }={}) {
  const p={...params};
  if(signed){ if(!KEY||!SECRET) throw new Error('Binance API credentials belum dikonfigurasi di server.'); p.timestamp=Date.now(); p.recvWindow=5000; p.signature=sign(p); }
  const qs=new URLSearchParams(p).toString();
  const url=BASE+path+(qs?`?${qs}`:'');
  const response=await fetch(url,{method,headers:{'X-MBX-APIKEY':KEY}});
  const text=await response.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!response.ok) throw new Error(data?.msg||`Binance HTTP ${response.status}`);
  return data;
}
async function readBody(req){
  if(req.body&&typeof req.body==='object') return req.body;
  return await new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>100000)reject(new Error('body too large'))});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}});req.on('error',reject)});
}
function headers(res){res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json; charset=utf-8')}
function requireLive(){if(!ALLOW_LIVE) throw new Error('Live trading disabled. Aktifkan ALLOW_LIVE_TRADING=true hanya setelah testnet/paper tervalidasi.');}

export default async function handler(req,res){
  headers(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const path=new URL(req.url,'https://vercel.local').pathname;
    if(path==='/api/health'&&req.method==='GET') return res.status(200).json({ok:true,mode:ALLOW_LIVE?'live-enabled':'paper-only',maxRiskPct:MAX_RISK_PCT,testnet:BASE.includes('testnet'),time:Date.now()});
    if(path==='/api/account'&&req.method==='GET'){
      if(!KEY||!SECRET) return res.status(200).json({connected:false,reason:'API key not configured'});
      const a=await binance('/fapi/v3/account',{signed:true});
      return res.status(200).json({connected:true,account:{walletBalance:a.totalWalletBalance,availableBalance:a.availableBalance,unrealizedProfit:a.totalUnrealizedProfit},assets:a.assets,positions:(a.positions||[]).filter(x=>Number(x.positionAmt)!==0)});
    }
    if(path==='/api/exchange-info'&&req.method==='GET') return res.status(200).json(await binance('/fapi/v1/exchangeInfo'));
    if(path==='/api/order'&&req.method==='POST'){
      requireLive(); const x=await readBody(req);
      if(!x.symbol||!x.side||!x.quantity) return res.status(400).json({error:'symbol, side, quantity wajib.'});
      return res.status(200).json(await binance('/fapi/v1/order',{method:'POST',params:{symbol:String(x.symbol).toUpperCase(),side:String(x.side).toUpperCase(),type:x.type||'MARKET',quantity:String(x.quantity),...(x.price?{price:String(x.price)}:{}),...(x.stopPrice?{stopPrice:String(x.stopPrice)}:{}),...(x.reduceOnly!==undefined?{reduceOnly:String(!!x.reduceOnly)}:{})},signed:true}));
    }
    if(path==='/api/bracket-order'&&req.method==='POST'){
      requireLive(); const x=await readBody(req); const symbol=String(x.symbol||'').toUpperCase(), side=String(x.side||'').toUpperCase();
      const qty=String(x.quantity||''); const sl=Number(x.stopPrice),tp=Number(x.takeProfitPrice);
      if(!symbol||!['BUY','SELL'].includes(side)||!qty||!(sl>0)||!(tp>0)) return res.status(400).json({error:'symbol, side, quantity, stopPrice, takeProfitPrice wajib.'});
      const entry=await binance('/fapi/v1/order',{method:'POST',params:{symbol,side,type:'MARKET',quantity:qty},signed:true});
      const exitSide=side==='BUY'?'SELL':'BUY'; let stopOrder,tpOrder;
      try{
        stopOrder=await binance('/fapi/v1/order',{method:'POST',params:{symbol,side:exitSide,type:'STOP_MARKET',stopPrice:String(sl),closePosition:'true',workingType:'MARK_PRICE'},signed:true});
        tpOrder=await binance('/fapi/v1/order',{method:'POST',params:{symbol,side:exitSide,type:'TAKE_PROFIT_MARKET',stopPrice:String(tp),closePosition:'true',workingType:'MARK_PRICE'},signed:true});
      }catch(e){
        try{await binance('/fapi/v1/order',{method:'POST',params:{symbol,side:exitSide,type:'MARKET',quantity:qty,reduceOnly:'true'},signed:true})}catch{}
        throw new Error(`Entry dibuat tetapi bracket SL/TP gagal: ${e.message}. Posisi dicoba ditutup otomatis.`);
      }
      return res.status(200).json({entry,stopOrder,tpOrder});
    }
    if(path==='/api/close'&&req.method==='POST'){
      requireLive(); const x=await readBody(req); if(!x.symbol||!x.quantity||!x.side) return res.status(400).json({error:'symbol, quantity, side wajib.'});
      return res.status(200).json(await binance('/fapi/v1/order',{method:'POST',params:{symbol:String(x.symbol).toUpperCase(),side:String(x.side).toUpperCase(),type:'MARKET',quantity:String(x.quantity),reduceOnly:'true'},signed:true}));
    }
    return res.status(404).json({error:'Not found'});
  }catch(error){console.error(error);return res.status(500).json({error:error.message||'Internal server error'})}
}
