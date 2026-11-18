/* KrishiSetu Credit Engine v3: scoring logic.
   Factor formulas are identical to Credit Engine v2 (and to pipeline/build.py::factor_scores).
   What changed: data tables now cover all 36 States/UTs from official statistics, and the
   composite is a trained logistic scorecard (weights learned, PD-calibrated, PDO-scaled). */
(function () {
  const KS = window.KS, E = KS.engine, M = KS.model;
  const CROP_LABELS = { wheat: 'Wheat', paddy: 'Paddy / Rice', cotton: 'Cotton', soybean: 'Soybean', sugarcane: 'Sugarcane', maize: 'Maize', mustard: 'Mustard', tur: 'Tur / Arhar' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function nextCycle(crop, now = new Date()) {
    const tl = E.timeline[crop];
    const mi = m => MONTHS.indexOf(m);
    let sowYear = now.getFullYear();
    if (mi(tl.sow) < now.getMonth()) sowYear += 1;
    const harvestYear = sowYear + (mi(tl.harvest) < mi(tl.sow) ? 1 : 0);
    const repayYear = harvestYear + (mi(tl.repay) < mi(tl.harvest) ? 1 : 0);
    return { sowYear, harvestYear, repayYear, months: tl.months };
  }

  function factors(x) {
    const bench = E.yield[x.state][x.crop];
    const costAcre = E.cost[x.state][x.crop];
    const rel = E.rain_reliability[x.state];
    const ratio = x.yield / bench;
    const fYield = Math.min(800, Math.min(800, Math.max(300, 300 + ratio * 300)) * E.irrig_mod[x.irrigation]);
    const sens = E.water_sens[x.crop];
    const wr = Math.max(0.2, rel * (1 - sens * 0.3) - x.events * 0.06);
    const fWeather = 300 + wr * 500;
    const fMarket = 350 + E.msp_prot[x.crop] * 350 - E.price_cv[x.crop] * 400;
    const fRepay = 300 + x.repay / 100 * 500;
    const months = E.timeline[x.crop].months;
    const inputCost = costAcre * x.acres * x.cycles;
    const gross = x.yield * x.acres * E.msp[x.crop] * x.cycles;
    const offAnnual = x.offfarm * 12, hhAnnual = x.hh * 12, existingService = x.outstanding * 0.12;
    const surplus = gross - inputCost + offAnnual - hhAnnual - existingService;
    const due = x.loan * (1 + 0.07 * months / 12);
    const dscr = surplus > 0 ? surplus / due : 0;
    const fIncome = Math.min(800, Math.max(250, 250 + Math.min(dscr, 2) / 2 * 550));
    let fScheme = 400;
    for (const k of ['pmfby', 'kcc', 'pmkisan', 'shg', 'enam', 'soil']) if (x[k]) fScheme += E.scheme_pts[k];
    fScheme = Math.min(800, fScheme);
    const fTenure = E.tenure[x.tenure];
    const fExp = 400 + Math.min(x.exp, 15) / 15 * 350;
    return {
      f: { f_yield: fYield, f_weather: fWeather, f_repay: fRepay, f_income: fIncome, f_market: fMarket, f_scheme: fScheme, f_tenure: fTenure, f_exp: fExp },
      aux: { bench, costAcre, rel, ratio, sens, wr, months, inputCost, gross, offAnnual, hhAnnual, existingService, surplus, due, dscr }
    };
  }

  function score(x) {
    const { f, aux } = factors(x);
    let eta = M.intercept;
    const contrib = M.factors.map((k, i) => {
      const z = (f[k] - M.mu[i]) / M.sd[i];
      const lp = M.coef[i] * z;
      eta += lp;
      return { key: k, label: M.labels[i], raw: f[k], z, points: M.scale_factor * lp, weight: M.learned_weights[i], prior: M.v2_weights[i] };
    });
    const pGood = 1 / (1 + Math.exp(-eta));
    const pd = 1 - pGood;
    const s = Math.round(Math.max(300, Math.min(850, M.scale_offset + M.scale_factor * Math.log(pGood / Math.max(pd, 1e-6)))));
    const band = E.bands.find(b => s >= b.floor) || E.bands[E.bands.length - 1];
    // state stress multiplier from the monsoon-2026 scenario
    const st = KS.states[x.state].model;
    const stressMult = st.default_baseline > 0 ? st.default_m26 / st.default_baseline : 1;
    const pdStress = Math.min(0.99, pd * stressMult);

    // loan sizing: KCC scale of finance, capped by repayment capacity, band multiplier (v2 policy)
    const sofLimit = aux.inputCost * 1.3;
    const incomeMax = Math.max(0, aux.surplus * 1.5);
    const maxLoan = Math.min(x.loan, Math.min(incomeMax, sofLimit) * band.cap);
    const sanctioned = Math.max(0, Math.round(maxLoan / 1000) * 1000);
    // MISS (Budget 2025-26 raised limit to Rs 5 lakh): 7% standard, 1.5% subvention + 3% PRI -> 4%
    const missLimit = 500000;
    const missEligible = x.kcc && s >= 600 && sanctioned > 0 && sanctioned <= missLimit;
    const rate = missEligible ? Math.max(4.0, band.rate - 3.0) : band.rate;
    const interest = sanctioned * rate / 100 * aux.months / 12;
    const cyc = nextCycle(x.crop);
    // reason codes: factors pulling the score down the most vs the average borrower
    const reasons = contrib.filter(c => c.points < -2).sort((a, b) => a.points - b.points).slice(0, 4);
    return { score: s, pd, pdStress, stressMult, band, contrib, aux, sanctioned, rate, missEligible, interest, cyc, reasons, f };
  }

  window.KSEngine = { score, factors, CROP_LABELS, nextCycle };
})();
