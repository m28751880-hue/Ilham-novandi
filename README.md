# ilham novandi Futures Command Center — Chart Fixed v1.1.1

Perbaikan chart: validasi library, loading state, direct Binance REST fallback, candle deduplication/sorting, responsive resize, dan WebSocket endpoint USD-M yang benar.
# ilham novandi — Futures Command Center

Vercel-ready Binance Futures dashboard focused on **15-minute analysis only**.

## Modes
- PAPER: default, no real order.
- TESTNET: use Binance Futures Testnet via `BINANCE_BASE_URL=https://testnet.binancefuture.com`.
- LIVE: only when `ALLOW_LIVE_TRADING=true`; live entry uses server-side bracket SL/TP.

## Included
- Realtime 15M chart, H/L, candle countdown and direction/wick analysis.
- EMA20, auto S/R, manual trendline/Fibonacci.
- Scanner: Top Gainers (short candidates) and Top Losers (long candidates).
- Paper Engine with automatic pair switching.
- Signal confidence + Market Regime + No-Trade Zone.
- Risk Guard: max risk, daily loss, max positions, cooldown after consecutive losses, spread/slippage/fee-aware estimates.
- Position sizing, SL/TP, Break Even (SL Plus), partial TP and trailing-stop simulation.
- Kill Switch and manual close.
- Backtest center using the same 15M candle dataset and strategy rules.
- Consecutive-loss and drawdown statistics.
- Trading checklist and education modules.
- Account balance/PnL in IDR display (underlying Binance values remain USDT).

## Deploy
Import this repository/zip into Vercel. Build command: `npm run build`. No output directory.
Set environment variables in Vercel. Do not commit `.env`.

## Safety
This project does not guarantee profit. Automated trading can lose money. Keep Paper/Testnet enabled while validating. The server has a hard `MAX_RISK_PCT` cap and live trading is disabled by default.


## Auto Hunter 15M

Paper Engine sekarang menggunakan mode **opportunity rotation**, bukan sekadar mengganti pair. Setiap scan, engine mengambil kandidat Top Gainers/Top Losers, membaca candle 15M kandidat, menghitung signal/confidence, lalu memilih setup yang lolos. Jika tidak ada posisi, engine dapat langsung membuka PAPER BUY/SHORT. Jika sudah ada posisi, engine hanya melakukan rotasi bila kandidat baru mengungguli setup aktif minimal `HUNTER.switchAdvantage` (default 10 poin), menutup posisi lama, berpindah pair, memuat chart 15M, memvalidasi ulang candle terbaru, lalu langsung mengambil posisi baru. Risk Guard, daily loss limit, consecutive-loss cooldown, dan Kill Switch tetap berlaku.

Parameter utama di frontend: `minConfidence=70`, `switchAdvantage=10`, scan sekitar 15 detik, maksimal 10 kandidat per siklus. Auto Hunter ini sengaja aktif untuk **PAPER mode**; live order tetap memerlukan aksi/manual safety gate.

## Production hardening
- Server-side market-data proxy for 15M ticker/klines; browser no longer depends on direct REST CORS for scanning.
- Auto Hunter universe combines high absolute movers and highest-liquidity USDT futures, then validates each candidate with live 15M candles.
- Fast trigger can enter PAPER on the current live 15M candle when the full confidence gate is satisfied.
- Paper state, PnL, loss streak and active position persist across a page refresh for the current day.
- Testnet trading is separately gated by `ALLOW_TESTNET_TRADING` (default true in the example); LIVE trading additionally requires `ALLOW_LIVE_TRADING=true` and a server-only `TRADING_TOKEN`.
- `MAX_NOTIONAL_USDT` adds a server-side notional safety ceiling.
- LIVE remains disabled by default. Never put Binance API secrets or `TRADING_TOKEN` in frontend code.

## Validation
The package passes Node syntax checks for the serverless API, local server and frontend JavaScript extraction. External Binance connectivity must still be validated in the deployed environment because this build environment may not have outbound DNS/network access.
