const forecast48 = (() => {
  const fields = ['temperature_2m', 'weather_code', 'is_day', 'rain', 'snowfall',
    'wind_speed_10m', 'wind_gusts_10m'];
  const zone = {timeZone: 'Europe/Paris'};
  const dayFormat = new Intl.DateTimeFormat('fr-FR', {...zone, weekday: 'long', day: 'numeric', month: 'short'});
  const hourFormat = new Intl.DateTimeFormat('fr-FR', {...zone, hour: '2-digit', minute: '2-digit'});
  const offsetFormat = new Intl.DateTimeFormat('fr-FR', {...zone, timeZoneName: 'shortOffset'});
  const number = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2});
  const metrics = [
    ['temperature_2m', 'Température', '°C', '#ffcd53'],
    ['rain', 'Pluie', 'mm', '#80d7ff'],
    ['probability', 'Probabilité de précipitations', '%', '#a9cbff'],
    ['wind_speed_10m', 'Vent', 'km/h', '#8fe2c3'],
    ['wind_gusts_10m', 'Rafales', 'km/h', '#d5baff'],
    ['snowfall', 'Neige', 'cm', '#edf5ff']
  ];
  const cache = new Map();
  let revision = 0;

  async function request(endpoint, lat, lon, start) {
    const general = endpoint === 'forecast';
    const query = new URLSearchParams({
      latitude: lat, longitude: lon, timezone: 'GMT', timeformat: 'unixtime',
      forecast_hours: '49',
      hourly: [...fields, ...(general ? ['showers', 'precipitation_probability'] : [])].join(',')
    });
    const key = endpoint + '?' + query;
    const hit = cache.get(key);
    if (hit?.start === start && hit.expires > Date.now()) return hit.promise;
    const promise = (async () => {
      const response = await fetch('https://api.open-meteo.com/v1/' + key, {
        signal: AbortSignal.timeout(9000)
      });
      if (!response.ok) throw new Error('Open-Meteo HTTP ' + response.status);
      const {hourly} = await response.json();
      if (!Array.isArray(hourly?.time)) throw new Error('Prévision horaire absente');
      return new Map(hourly.time.map((time, index) => [time, Object.fromEntries(
        Object.keys(hourly).filter(field => field !== 'time').map(field => {
          const value = hourly[field]?.[index];
          return [field, Number.isFinite(value) ? value : null];
        })
      )]));
    })();
    if (cache.size >= 16) cache.delete(cache.keys().next().value);
    cache.set(key, {start, expires: Date.now() + 10 * 60_000, promise});
    try {
      return await promise;
    } catch (error) {
      if (cache.get(key)?.promise === promise) cache.delete(key);
      throw error;
    }
  }

  function hours(start, regional, general) {
    return Array.from({length: 48}, (_, index) => {
      const time = start + index * 3600;
      const preferred = regional?.get(time);
      const fallback = general?.get(time);
      const liquid = [fallback?.rain, fallback?.showers];
      const values = Object.fromEntries(fields.map(field => [
        field, preferred?.[field] ?? fallback?.[field] ?? null
      ]));
      values.rain = preferred?.rain ?? (liquid.every(Number.isFinite) ? liquid[0] + liquid[1] : null);
      values.probability = fallback?.precipitation_probability ?? null;
      return {time: new Date(time * 1000), ...values};
    });
  }

  function element(tag, label, className) {
    const node = document.createElement(tag);
    if (label) node.textContent = label;
    if (className) node.className = className;
    return node;
  }

  function button(label, action) {
    const node = element('button', label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function format(value, unit) {
    return Number.isFinite(value) ? number.format(value) + ' ' + unit : '—';
  }

  function drawChart(svg, rows, metric, selected, rainOverlay = false) {
    const [field, label, unit, color] = metric;
    const values = rows.map(row => row[field]).filter(Number.isFinite);
    svg.replaceChildren();
    svg.setAttribute('aria-label', rainOverlay ? label + ' et pluie sur 48 heures' : label);
    const add = (tag, attributes, label) => {
      const node = document.createElementNS(svg.namespaceURI, tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      if (label) node.textContent = label;
      svg.append(node);
    };
    const rainValues = rainOverlay ? rows.map(row => row.rain).filter(Number.isFinite) : [];
    if (!values.length && !rainValues.length) {
      add('text', {x: 180, y: 66, 'text-anchor': 'middle'}, 'Données indisponibles');
      return;
    }
    const low = field === 'temperature_2m' && values.length ? Math.floor(Math.min(...values)) : 0;
    const high = field === 'probability' ? 100 : Math.max(low + 1, Math.ceil(Math.max(...values)));
    const x = index => rows.length === 1 ? 202 : 54 + index * 296 / (rows.length - 1);
    const y = value => 94 - (value - low) * 74 / (high - low);
    for (const value of values.length ? [low, high] : []) {
      add('line', {x1: 54, x2: 350, y1: y(value), y2: y(value), class: 'f48-grid'});
      add('text', {x: 49, y: y(value) + 4, 'text-anchor': 'end'}, format(value, unit));
    }
    if (selected != null) add('line', {x1: x(selected), x2: x(selected), y1: 16, y2: 98, class: 'f48-cursor'});
    if (rainValues.length) {
      const peak = Math.max(1, ...rainValues);
      const width = Math.min(6, 210 / rows.length);
      rows.forEach((row, index) => {
        if (!Number.isFinite(row.rain) || row.rain <= 0) return;
        const height = 53 * row.rain / peak;
        add('rect', {x: x(index) - width / 2, y: 94 - height, width, height, fill: '#80d7ff', opacity: .78});
      });
      add('text', {x: 350, y: 11, 'text-anchor': 'end'}, format(peak, 'mm'));
    }
    if (field === 'rain' || field === 'snowfall' || field === 'probability') {
      const width = Math.min(18, 208 / rows.length);
      rows.forEach((row, index) => {
        const value = row[field];
        if (!Number.isFinite(value)) return;
        const height = Math.max(1, y(0) - y(value));
        add('rect', {x: x(index) - width / 2, y: y(0) - height, width, height,
          rx: 2, fill: color, opacity: index === selected ? 1 : .72});
      });
    } else {
      let path = '';
      rows.forEach((row, index) => {
        if (!Number.isFinite(row[field])) return;
        const point = x(index) + ' ' + y(row[field]);
        path += (Number.isFinite(rows[index - 1]?.[field]) ? ' L' : ' M') + point;
      });
      add('path', {d: path, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round'});
      rows.forEach((row, index) => {
        if (Number.isFinite(row[field])) add('circle', {
          cx: x(index), cy: y(row[field]), r: index === selected ? 5 : 2, fill: color
        });
      });
    }
    const ticks = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
    ticks.forEach(index => add('text', {
      x: x(index), y: 117, 'text-anchor': index === ticks.at(-1) ? 'end' : 'middle'
    }, hourFormat.format(rows[index].time)));
  }

  function render(root, forecast, source) {
    const days = new Map();
    for (const row of forecast) {
      const day = dayFormat.format(row.time);
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(row);
    }
    const tabs = element('div', '', 'f48-days');
    const timeline = element('div', '', 'f48-timeline');
    const detail = element('div', '', 'f48-detail');
    detail.setAttribute('aria-live', 'polite');
    const picker = element('label', 'Graphique', 'f48-picker');
    const selector = element('select');
    picker.append(selector);
    const visibleMetrics = metrics.filter(([field]) =>
      field !== 'snowfall' || forecast.some(row => row.snowfall > 0));
    visibleMetrics.forEach(metric => selector.add(element('option', metric[1])));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 360 124');
    svg.setAttribute('role', 'img');
    const slider = element('input');
    slider.type = 'range';
    slider.min = 0;
    slider.setAttribute('aria-label', 'Choisir une heure sur le graphique');
    const chart = element('div', '', 'f48-chart');
    chart.append(picker, svg, slider);
    let rows, cards, selected, hourLabels;
    const updateChart = () => drawChart(svg, rows, visibleMetrics[selector.selectedIndex], selected);
    function select(index, reveal = false) {
      selected = index;
      const row = rows[index];
      const code = row.weather_code;
      const condition = code === null ? 'Conditions indisponibles' : weatherInfo(code, row.is_day ?? undefined)[1];
      detail.replaceChildren(element('h3', hourLabels[index] + ' · ' + condition));
      const list = element('dl');
      visibleMetrics.forEach(([field, label, unit]) =>
        list.append(element('dt', label), element('dd', format(row[field], unit))));
      detail.append(list);
      cards.forEach((card, i) => card.setAttribute('aria-pressed', String(i === index)));
      slider.value = index;
      slider.setAttribute('aria-valuetext', hourLabels[index]);
      if (reveal) {
        const card = cards[index];
        timeline.scrollLeft = card.offsetLeft - (timeline.clientWidth - card.offsetWidth) / 2;
      }
      updateChart();
    }
    const dayButtons = [...days].map(([day, entries], dayIndex) => button(day, () => {
      dayButtons.forEach((tab, index) => tab.setAttribute('aria-pressed', String(index === dayIndex)));
      rows = entries;
      const labels = rows.map(row => hourFormat.format(row.time));
      hourLabels = labels.map((label, index) => labels.indexOf(label) === labels.lastIndexOf(label)
        ? label : label + ' ' + offsetFormat.formatToParts(rows[index].time).find(part => part.type === 'timeZoneName').value);
      cards = rows.map((row, index) => {
        const [icon, condition] = row.weather_code === null
          ? ['—', 'Conditions indisponibles'] : weatherInfo(row.weather_code, row.is_day ?? undefined);
        const card = button('', () => select(index));
        const symbol = element('span', icon, 'f48-icon');
        symbol.setAttribute('aria-hidden', 'true');
        card.append(element('span', hourLabels[index]), symbol,
          element('strong', format(row.temperature_2m, '°C')),
          element('span', format(row.probability, '%'), 'f48-probability'));
        card.setAttribute('aria-label', [hourLabels[index], condition,
          'Température ' + format(row.temperature_2m, '°C'), 'Risque de précipitations ' + format(row.probability, '%')].join(', '));
        return card;
      });
      timeline.replaceChildren(...cards);
      timeline.scrollLeft = 0;
      slider.max = rows.length - 1;
      slider.disabled = rows.length === 1;
      select(0);
    }));
    tabs.append(...dayButtons);
    selector.addEventListener('change', updateChart);
    slider.addEventListener('input', () => select(Number(slider.value), true));
    svg.addEventListener('click', event => {
      const bounds = svg.getBoundingClientRect();
      const ratio = ((event.clientX - bounds.left) * 360 / bounds.width - 54) / 296;
      select(Math.round(Math.max(0, Math.min(1, ratio)) * (rows.length - 1)), true);
    });
    const summary = document.createElementNS(svg.namespaceURI, 'svg');
    summary.setAttribute('viewBox', '0 0 360 124');
    summary.setAttribute('role', 'img');
    summary.classList.add('f48-overview');
    drawChart(summary, forecast, metrics[0], null, true);
    const legend = element('div', '', 'f48-legend');
    legend.append(
      element('span', forecast.some(row => Number.isFinite(row.temperature_2m)) ? 'Température (°C)' : 'Température indisponible'),
      element('span', forecast.some(row => Number.isFinite(row.rain)) ? 'Pluie (mm)' : 'Pluie indisponible')
    );
    const details = element('details', '', 'home-card-details');
    details.append(element('summary', 'Détails heure par heure'), tabs, timeline, chart, detail, element('p',
      'Heure de Paris. Pluie, neige et probabilité sur l’heure qui précède l’heure affichée. ' + source,
      'f48-note'));
    root.replaceChildren(legend, summary, details);
    dayButtons[0].click();
  }

  async function load(lat, lon) {
    const root = document.getElementById('hourly');
    const active = ++revision;
    const start = Math.ceil(Date.now() / 3_600_000) * 3600;
    root.replaceChildren(element('p', 'Chargement des prévisions…', 'f48-note'));
    const [regional, general] = await Promise.allSettled([
      request('meteofrance', lat, lon, start), request('forecast', lat, lon, start)
    ]);
    if (active !== revision) return;
    const rows = hours(start, regional.value, general.value);
    const source = regional.value
      ? 'Open-Meteo · AROME/ARPEGE selon la couverture et l’échéance. Prévision générale pour la probabilité et les valeurs manquantes.'
      : 'Source : prévision générale Open-Meteo.';
    if (rows.some(row => metrics.some(([field]) => Number.isFinite(row[field])))) {
      render(root, rows, source);
    } else {
      root.replaceChildren(element('p', 'Prévisions horaires indisponibles.', 'f48-note'),
        button('Réessayer', () => load(lat, lon)));
    }
  }

  return {load};
})();
