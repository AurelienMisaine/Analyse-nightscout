let glucoseChart, insulinChart;

function getConfig() {
    const url = document.getElementById('nightscoutUrl').value.trim();
    const secret = document.getElementById('apiToken').value.trim();

    if (!url) {
        throw new Error("Veuillez renseigner l'URL de votre instance Nightscout.");
    }

    if (!secret) {
        throw new Error('Veuillez indiquer un API secret, son hash ou un token reporter.');
    }

    return { url: url.replace(/\/$/, ''), secret };
}

function buildAuthHeaders(secret) {
    const trimmedSecret = secret.trim();

    if (/^[0-9a-f]{40}$/i.test(trimmedSecret)) {
        return { 'api-secret': trimmedSecret };
    }

    if (/^bearer\s+/i.test(trimmedSecret)) {
        return { Authorization: trimmedSecret };
    }

    if (/^[a-z]+-[0-9a-f]+$/i.test(trimmedSecret)) {
        return { Authorization: `Bearer ${trimmedSecret}` };
    }

    return { 'api-secret': CryptoJS.SHA1(trimmedSecret).toString() };
}

async function loadData() {
    try {
        showLoading(true);

        const config = getConfig();

        const [glucoseData, treatments] = await Promise.all([
            fetchData(config, 'entries.json?count=1000'),
            fetchData(config, 'treatments.json?count=1000')
        ]);

        const stats = calculateStats(glucoseData);
        updateStats(stats);
        updateCharts(glucoseData, treatments);

    } catch (error) {
        showError(`Erreur : ${error.message}`);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

async function fetchData(config, endpoint) {
    const headers = {
        Accept: 'application/json',
        ...buildAuthHeaders(config.secret)
    };

    try {
        const response = await fetch(`${config.url}/api/v1/${endpoint}`, {
            headers
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();

    } catch (error) {
        throw error;
    }
}

function calculateStats(glucoseData) {
    const values = glucoseData
        .map(e => e.sgv)
        .filter(v => typeof v === 'number');

    if (values.length === 0) {
        return {
            avg: 'N/A',
            tir: 'N/A',
            gmi: 'N/A',
            cv: 'N/A'
        };
    }

    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    
    const ranges = {
        hypo: values.filter(v => v < 70).length,
        target: values.filter(v => v >= 70 && v <= 180).length,
        hyper: values.filter(v => v > 180).length
    };
    
    const tir = Math.round((ranges.target / values.length) * 100);
    const gmi = ((avg + 46.7) / 28.7).toFixed(1);
    const cv = avg ? (Math.round((stdev(values) / avg) * 1000) / 10) : 'N/A';

    return {
        avg,
        tir,
        gmi,
        cv
    };
}

function updateStats(stats) {
    const averageText = typeof stats.avg === 'number' ? `${stats.avg} mg/dL` : stats.avg;
    const tirText = typeof stats.tir === 'number' ? `${stats.tir}%` : stats.tir;
    const gmiText = typeof stats.gmi === 'number' ? `${stats.gmi}%` : stats.gmi;
    const cvText = typeof stats.cv === 'number' ? `${stats.cv}%` : stats.cv;

    document.getElementById('stats').innerHTML = `
        <div class="stat-box">
            <h3>Moyenne glycémique</h3>
            <p>${averageText}</p>
        </div>
        <div class="stat-box">
            <h3>Temps dans la cible</h3>
            <p>${tirText}</p>
        </div>
        <div class="stat-box">
            <h3>GMI</h3>
            <p>${gmiText}</p>
        </div>
        <div class="stat-box">
            <h3>Coeff. de variation</h3>
            <p>${cvText}</p>
        </div>
    `;
}

function updateCharts(glucose, treatments) {
    const glucosePoints = glucose
        .filter(entry => typeof entry.sgv === 'number')
        .map(entry => ({
            value: entry.sgv,
            date: toDate(entry.dateString ?? entry.date ?? entry.created_at)
        }));

    const glucoseLabels = glucosePoints.map(point => formatHourMinute(point.date));
    const glucoseValues = glucosePoints.map(point => point.value);

    // Graphique Glycémie
    const glucoseCtx = document.getElementById('glucoseChart').getContext('2d');
    if (glucoseChart) glucoseChart.destroy();

    glucoseChart = new Chart(glucoseCtx, {
        type: 'line',
        data: {
            labels: glucoseLabels,
            datasets: [{
                label: 'Glycémie (mg/dL)',
                data: glucoseValues,
                borderColor: '#e74c3c',
                tension: 0.1
            }]
        }
    });

    // Graphique Insuline
    const insulinData = processInsulinData(treatments);
    const insulinCtx = document.getElementById('insulinChart').getContext('2d');
    if (insulinChart) insulinChart.destroy();
    
    insulinChart = new Chart(insulinCtx, {
        type: 'bar',
        data: {
            labels: insulinData.labels,
            datasets: [{
                label: 'Insuline (U)',
                data: insulinData.values,
                backgroundColor: '#3498db'
            }]
        }
    });
}

function processInsulinData(treatments) {
    const insulinByHour = Array(24).fill(0);

    treatments
        .filter(t => typeof t.insulin === 'number')
        .forEach(t => {
            const date = toDate(t.created_at ?? t.timestamp ?? t.date);
            if (!date) return;
            const hour = date.getHours();
            insulinByHour[hour] += t.insulin;
    });

    return {
        labels: Array.from({length: 24}, (_, i) => `${i}h`),
        values: insulinByHour
    };
}

function toDate(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const trimmed = value.trim();

        if (/^\d+$/.test(trimmed)) {
            const fromNumber = new Date(Number(trimmed));
            if (!Number.isNaN(fromNumber.getTime())) {
                return fromNumber;
            }
        }

        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function formatHourMinute(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function stdev(values) {
    const avg = values.reduce((a, b) => a + b) / values.length;
    return Math.sqrt(values.map(v => Math.pow(v - avg, 2)).reduce((a, b) => a + b) / values.length);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showError(message) {
    let errorDiv = document.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        document.body.prepend(errorDiv);
    }

    errorDiv.innerHTML = `
        🚨 ERREUR : ${message}<br>
        Vérifiez :<br>
        1. Que l'URL est correcte<br>
        2. Que le token a les permissions "reporter"<br>
        3. La console pour plus de détails
    `;
}

// Chargement initial
(async () => {
    try {
        await loadData();
    } catch (error) {
        console.warn('Initial load failed:', error);
    }
})();
