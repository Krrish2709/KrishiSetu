(() => {
  const data = window.KS;
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const log = document.getElementById('chatLog');
  const status = document.getElementById('chatStatus');
  const suggestions = document.getElementById('chatSuggestions');
  const turns = [];
  const pct = value => value == null ? 'unavailable' : `${(value * 100).toFixed(1)}%`;
  const words = text => text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const statesByName = Object.values(data.states);
  const greeting = 'Ask me about a named state, how the credit score works, what the risk index measures, or when a crop loan is repaid. Try “Compare Punjab and Maharashtra”.';

  function stateNamesIn(text) {
    const stateAliases = { 'orissa': 'odisha', 'uttaranchal': 'uttarakhand', 'chattisgarh': 'chhattisgarh' };
    let phrase = ` ${words(text)} `;
    for (const [alias, name] of Object.entries(stateAliases)) {
      phrase = phrase.replace(` ${alias} `, ` ${name} `);
    }
    return statesByName.filter(state => phrase.includes(` ${words(state.name)} `));
  }

  const stateMetrics = [
    { label: '2026 monsoon district deficit', pattern: /rainfall|monsoon|deficit/, get: s => s.mon26_deficit_share, display: pct },
    { label: 'Irrigated share', pattern: /irrigat/, get: s => s.irrigation_pct, display: pct },
    { label: 'Credit gap', pattern: /credit gap|kcc coverage/, get: s => s.credit_gap, display: pct },
    { label: 'Modelled baseline default rate', pattern: /default/, get: s => s.model.default_baseline, display: pct },
    { label: 'Average simulated credit score', pattern: /score/, get: s => s.model.avg_score, display: v => `${v} / 850` },
    { label: 'Regional risk index', pattern: /risk/, get: s => s.risk_index, display: v => `${v.toFixed(0)} / 100` }
  ];

  function siteGuide(question, previous) {
    const q = words(question);
    const crop = Object.keys(data.engine.timeline).find(name => ` ${q} `.includes(` ${name} `))
      || (/\b(rice)\b/.test(q) ? 'paddy' : null);
    if (crop && /repay|harvest|sow|loan|cycle/.test(q)) {
      const cycle = data.engine.timeline[crop];
      return `For ${crop}, the demo uses ${cycle.sow} for sowing, ${cycle.harvest} for harvest and ${cycle.repay} as the expected repayment month. The demo sets repayment 14 days after the harvest sale.\n\nOpen Credit Engine and select ${crop} to see a worked schedule.`;
    }

    let states = stateNamesIn(question);
    const metric = stateMetrics.find(item => item.pattern.test(q));
    if (!states.length && !/how|what is|what does|explain|mean/.test(q) && metric) states = stateNamesIn(previous);
    if (states.length) {
      const lines = states.slice(0, 6).map(s => {
        if (metric) {
          const value = metric.get(s);
          return `${s.name}: ${value == null ? 'unavailable' : metric.display(value)}`;
        }
        return `${s.name}\n• Regional risk: ${s.risk_index?.toFixed(0) ?? 'unavailable'} / 100\n• Average simulated score: ${s.model.avg_score} / 850\n• 2026 monsoon district deficit: ${pct(s.mon26_deficit_share)}\n• Irrigated share: ${pct(s.irrigation_pct)}`;
      });
      const lead = metric ? `${metric.label} in the dashboard snapshot:\n\n` : '';
      return `${lead}${lines.join('\n\n')}\n\nOpen India Map for the full profiles and data sources.`;
    }
    if (metric && /highest|lowest/.test(q)) {
      const eligible = statesByName.filter(s => Number.isFinite(metric.get(s)) && s.sas_basis === 'state');
      const direction = q.includes('lowest') ? 1 : -1;
      eligible.sort((a, b) => direction * (metric.get(a) - metric.get(b)));
      return `${q.includes('lowest') ? 'Lowest' : 'Highest'} ${metric.label.toLowerCase()} among state-level profiles:\n\n${eligible.slice(0, 3).map(s => `• ${s.name}: ${metric.display(metric.get(s))}`).join('\n')}\n\nOpen India Map to explore the full ranking.`;
    }
    if (/how.*score|score.*work|factor|dscr|credit score/.test(q)) {
      const factors = data.model.labels.map((name, i) => ({ name, weight: data.model.learned_weights[i] }));
      factors.sort((a, b) => b.weight - a.weight);
      return `The demo scores a profile from 300 to 850. Higher scores generally indicate lower modelled default risk. It combines eight factors, including ${factors.slice(0, 3).map(f => f.name.toLowerCase()).join(', ')}.\n\nTry a sample borrower in Credit Engine to see how each factor affects the score and repayment schedule. The model was calibrated on simulated borrower data.`;
    }
    if (/risk index|regional risk/.test(q)) {
      return 'The Regional Risk Index compares places on a 0–100 scale. Higher values mean greater relative risk. It combines debt load, farm household indebtedness, rain-fed exposure, smaller holdings, monsoon deficit, insurance coverage, and income. Open Methodology for the calculation.';
    }
    if (/repay|harvest|crop cycle|loan/.test(q)) {
      return 'In the KrishiSetu demo, loan funds are disbursed near sowing, and repayment is set 14 days after the harvest sale. The exact month depends on the crop. Which crop would you like to check?';
    }
    if (/monsoon|default/.test(q)) {
      return `In the national simulation, the modelled default rate is ${pct(data.national.default_baseline)} at baseline and ${pct(data.national.default_m26)} under the 2026 monsoon stress scenario. Use India Map to see how that changes by state.`;
    }
    return greeting;
  }

  function addMessage(role, text) {
    const message = document.createElement('p');
    message.className = `chat-message ${role}`;
    message.setAttribute('aria-label', role === 'user' ? 'You' : 'KrishiSetu Assistant');
    message.textContent = text;
    log.append(message);
    log.scrollTop = log.scrollHeight;
  }

  function reply(text) {
    if (!text.trim()) return;
    const question = text.trim();
    const previous = turns.filter(turn => turn.role === 'user').at(-1)?.text || '';
    turns.push({ role: 'user', text: question });
    addMessage('user', question);
    input.value = '';
    suggestions.hidden = true;
    const answer = siteGuide(question, previous);
    turns.push({ role: 'model', text: answer.slice(0, 1800) });
    if (turns.length > 10) turns.splice(0, 2);
    addMessage('model', answer);
    status.textContent = 'Site guide · Based on the KrishiSetu dashboard.';
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    reply(input.value);
  });
  suggestions.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button) {
      reply(button.textContent);
      input.focus();
    }
  });
})();
