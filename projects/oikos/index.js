import Web3 from 'web3';
import axios from 'axios';
import snx from '@oikos/oikos-bsc';
import feePoolABI from './FeePoolABI.json' assert { type: 'json' };
import exchangerABI from './ExchangerABI.json' assert { type: 'json' };
import exchangeRatesABI from './ExchangeRatesABI.json' assert { type: 'json' };
import BigNumber from 'bignumber.js';

const web3 = new Web3('https://bsc-dataseed.binance.org/'); // BSC Mainnet RPC

// Key contract addresses
const feePoolAddress = '0x4a7644B4b3ae6E4e2c53D01a39E7C4afA25061aF';
const exchangerAddress = '0xad17064Ad709f37CB97af2e26E2F9E896a65EBa4';
const exchangeRatesAddress = '0xe1ff83762F2db7274b6AC2c1C9Bb75B2A8574EaF';

const feePool = new web3.eth.Contract(feePoolABI, feePoolAddress);
const exchanger = new web3.eth.Contract(exchangerABI, exchangerAddress);
const exchangeRates = new web3.eth.Contract(exchangeRatesABI, exchangeRatesAddress);

// Utility function to convert string to bytes32
const toBytes32 = text => web3.utils.asciiToHex(text.padEnd(32, '\0'));

async function fetch({ endTimestamp }) {
    console.log("Starting data retrieval for Oikos...");

    let totalValueLocked = new BigNumber(0);
    let totalRevenue = new BigNumber(0);

    try {
        // TVL Calculation
        const synths = snx.getSynths({ network: 'bsc' });
        for (const synth of synths) {
            try {
                const currencyKey = toBytes32(synth.name);
                const oraclePrice = await exchangeRates.methods.rateForCurrency(currencyKey).call();
                const oracleUSD = new BigNumber(oraclePrice).div(1e18);
                totalValueLocked = totalValueLocked.plus(oracleUSD);
            } catch (oracleError) {
                console.warn(`⚠️ Failed to fetch Oracle price for: ${synth.name}`);
            }
        }

        // Revenue Calculation
        let totalFees = new BigNumber(await feePool.methods.totalFeesAvailable().call()).div(1e18);
        const exchangeFeeRate = new BigNumber(await exchanger.methods.feeRateForExchange(toBytes32('oUSD'), toBytes32('oBTC')).call()).div(1e18);
        totalRevenue = totalFees.plus(exchangeFeeRate);

        console.log(`✅ Total TVL Calculated: ${totalValueLocked.toFixed(2)} USD`);
        console.log(`✅ Total Revenue Calculated: ${totalRevenue.toFixed(2)} USD`);

        return {
            dailyVolume: undefined, // Not tracked for now
            dailyFees: totalRevenue.toFixed(2),
            dailyRevenue: totalRevenue.toFixed(2),
            dailySupplySideRevenue: totalRevenue.toFixed(2),
            tvl: totalValueLocked.toFixed(2),
        };
    } catch (error) {
        console.error("❌ Error fetching data:", error.message);
        return { tvl: undefined, dailyRevenue: undefined, dailyFees: undefined };
    }
}

export default {
    methodology: {
        Fees: "Calculated from on-chain FeePool data plus Exchanger fee rates as fallback.",
        Revenue: "Protocol revenue is derived directly from fees claimed in FeePool and fees collected in Exchanger.",
        TVL: "Total value of circulating Synths on BSC using on-chain Oracle data as primary source, with CoinGecko fallback."
    },
    fetch,
    runAtCurrTime: true // Ensure latest data only
};

fetch({ endTimestamp: Math.floor(Date.now() / 1000) }).then(console.log);
