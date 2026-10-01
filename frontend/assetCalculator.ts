import { SimulatorState, AssetYearRecord } from './types';
import { buildLifePlanTimeline } from './lifePlanCalculator';

export function buildAssetManagementTimeline(
 state: SimulatorState,
 overrideNisaOnly?: boolean
): AssetYearRecord[] {
 const isSingle = state.householdType === 'single';
 const cfg = state.lifePlan;

 const isNisaOnly = overrideNisaOnly !== undefined ? overrideNisaOnly : cfg.limitToNisaCap;

 const lifePlanRecords = buildLifePlanTimeline(state);

 const nisaLifetimeCap = isSingle ? 1800 : 3600;
 const nisaAnnualCap = isSingle ? 360 : 720;
 const returnRate = cfg.investmentReturnRate / 100;

 const b1Init = cfg.bucket1Cash;
 const b3Init = cfg.bucket3Emergency;

 let currentSurplusCash = Math.max(0, cfg.currentCashSavings - b1Init - b3Init);
 let currentB1 = b1Init;
 let currentB3 = b3Init;

 let initialTotalInvestments = cfg.primaryStrategy.investments + (isSingle ? 0 : cfg.spouseStrategy.investments);
 let currentNisa = Math.min(nisaLifetimeCap, initialTotalInvestments);
 let nisaContributed = currentNisa;
 let currentTaxable = isNisaOnly ? 0 : Math.max(0, initialTotalInvestments - currentNisa);

 const records: AssetYearRecord[] = [];

 for (let i = 0; i < lifePlanRecords.length; i++) {
  const lp = lifePlanRecords[i];
  const netIncome = lp.totalNetIncome;
  const expense = lp.totalExpense;
  const cashFlow = lp.annualCashFlow;

  let investToNisa = 0;
  let investToTaxable = 0;
  let rolloverToNisa = 0;

  let withdrawFromSurplusCash = 0;
  let withdrawFromTaxable = 0;
  let withdrawFromNisa = 0;
  let usedEmergencyBuffer = 0;

  currentNisa = Math.round(currentNisa * (1 + returnRate) * 10) / 10;
  currentTaxable = Math.round(currentTaxable * (1 + returnRate) * 10) / 10;

  if (cashFlow > 0) {
   let surplus = cashFlow;

   const nisaAvailableCap = Math.max(0, nisaLifetimeCap - nisaContributed);
   const nisaRoomThisYear = Math.min(nisaAnnualCap, nisaAvailableCap);

   if (nisaRoomThisYear > 0) {
    investToNisa = Math.min(surplus, nisaRoomThisYear);
    currentNisa = Math.round((currentNisa + investToNisa) * 10) / 10;
    nisaContributed += investToNisa;
    surplus = Math.round((surplus - investToNisa) * 10) / 10;

    const remainingNisaRoom = nisaRoomThisYear - investToNisa;
    if (remainingNisaRoom > 0 && currentTaxable > 0) {
     rolloverToNisa = Math.min(currentTaxable, remainingNisaRoom);
     currentTaxable = Math.round((currentTaxable - rolloverToNisa) * 10) / 10;
     currentNisa = Math.round((currentNisa + rolloverToNisa) * 10) / 10;
     nisaContributed += rolloverToNisa;
    }
   }

   if (surplus > 0) {
    if (!isNisaOnly) {
     investToTaxable = surplus;
     currentTaxable = Math.round((currentTaxable + investToTaxable) * 10) / 10;
    } else {
     currentSurplusCash = Math.round((currentSurplusCash + surplus) * 10) / 10;
    }
   }
  } else if (cashFlow < 0) {
   let deficit = Math.abs(cashFlow);

   if (currentSurplusCash > 0) {
    withdrawFromSurplusCash = Math.min(currentSurplusCash, deficit);
    currentSurplusCash = Math.round((currentSurplusCash - withdrawFromSurplusCash) * 10) / 10;
    deficit = Math.round((deficit - withdrawFromSurplusCash) * 10) / 10;
   }

   if (deficit > 0 && currentTaxable > 0) {
    withdrawFromTaxable = Math.min(currentTaxable, deficit);
    currentTaxable = Math.round((currentTaxable - withdrawFromTaxable) * 10) / 10;
    deficit = Math.round((deficit - withdrawFromTaxable) * 10) / 10;
   }

   if (deficit > 0 && currentNisa > 0) {
    withdrawFromNisa = Math.min(currentNisa, deficit);
    currentNisa = Math.round((currentNisa - withdrawFromNisa) * 10) / 10;
    deficit = Math.round((deficit - withdrawFromNisa) * 10) / 10;
   }

   if (deficit > 0) {
    const availableEmergency = currentB1 + currentB3;
    usedEmergencyBuffer = Math.min(availableEmergency, deficit);
    if (currentB1 >= usedEmergencyBuffer) {
     currentB1 = Math.round((currentB1 - usedEmergencyBuffer) * 10) / 10;
    } else {
     const fromB3 = usedEmergencyBuffer - currentB1;
     currentB1 = 0;
     currentB3 = Math.max(0, Math.round((currentB3 - fromB3) * 10) / 10);
    }
    deficit = Math.round((deficit - usedEmergencyBuffer) * 10) / 10;
   }
  }

  const totalNetAssets = Math.round(
   (currentNisa + currentTaxable + currentSurplusCash + currentB1 + currentB3) * 10
  ) / 10;

  const isDepleted = totalNetAssets <= 0;

  records.push({
   year: lp.year,
   age: lp.age,
   spouseAge: lp.spouseAge,
   isSpouseDeceased: lp.isSpouseDeceased,
   isPrimaryDeceased: lp.isPrimaryDeceased,
   isSinglePeriod: lp.isSinglePeriod,
   isTransitionToSingle: lp.isTransitionToSingle,
   firstPassingPersonName: lp.firstPassingPersonName,
   survivorPersonName: lp.survivorPersonName,
   firstPassingAgeText: lp.firstPassingAgeText,
   totalNetIncome: netIncome,
   totalExpense: expense,
   annualCashFlow: cashFlow,
   investToNisa,
   investToTaxable,
   rolloverToNisa,
   withdrawFromSurplusCash,
   withdrawFromTaxable,
   withdrawFromNisa,
   usedEmergencyBuffer,
   nisaBalance: currentNisa,
   nisaCumulativeContributed: nisaContributed,
   taxableBalance: currentTaxable,
   surplusCashBalance: currentSurplusCash,
   bucket1Balance: currentB1,
   bucket3Balance: currentB3,
   totalNetAssets,
   isNisaCapped: nisaContributed >= nisaLifetimeCap,
   isDepleted,
   eventLabel: lp.eventLabel,
  });
 }

 return records;
}