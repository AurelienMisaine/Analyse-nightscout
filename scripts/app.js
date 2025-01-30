let glucoseChart, insulinChart;

async function loadData() {
    try {
        showLoading(true);
        
        const [glucoseData, treatments] = await Promise.all([
            fetchData('entries.json?count=1000'),
            fetchData('treatments.json?count=1000')
        ]);

        const stats = calculateStats(glucoseData);
        updateStats(stats);
        updateCharts(glucoseData, treatments);

    } catch (error) {
        alert('Erreur : ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function fetchData(endpoint) {
    const url = document.getElementById('nightscoutUrl').value;
    const token = document.getElementById('apiToken').value;

    const response = await fetch(`${url}/api/v1/${endpoint}&token=${token}`);
    
    if (!response.ok) throw new Error('Erreur API');
    const data = await response.json();
    
    if (!data.length) throw new Error('Aucune donnée trouvée');
    return data;
}

function calculateStats(glucoseData) {
    const values = glucoseData.map(e => e.sgv);
    const avg = Math.round(values.reduce((a, b) => a + b) / values.length);
    
    const ranges = {
        hypo: values.filter(v => v < 70).length,
        target: values.filter(v => v >= 70 && v <= 180).length,
        hyper: values.filter(v => v > 180).length
    };
    
    return {
        avg,
        tir: Math.round((ranges.target / values.length) * 100),
        gmi: ((avg + 46.7) / 28.7).toFixed(1),
        cv: (Math.round((stdev(values) / avg) * 1000) / 10)
    };
}

function updateStats(stats) {
    document.getElementById('stats').innerHTML = `
        <div class="stat-box">
            <h3>Moyenne glycémique</h3>
            <p>${stats.avg} mg/dL</p>
        </div>
        <div class="stat-box">
            <h3>Temps dans la cible</h3>
            <p>${stats.tir}%</p>
        </div>
        <div class="stat-box">
            <h3>GMI</h3>
            <p>${stats.gmi}%</p>
        </div>
    `;
}

function updateCharts(glucose, treatments) {
    // Graphique Glycémie
    const glucoseCtx = document.getElementById('glucoseChart').getContext('2d');
    if (glucoseChart) glucoseChart.destroy();
    
    glucoseChart = new Chart(glucoseCtx, {
        type: 'line',
        data: {
            labels: glucose.map(e => new Date(e.dateString).toLocaleTimeString()),
            datasets: [{
                label: 'Glycémie (mg/dL)',
                data: glucose.map(e => e.sgv),
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
    
    treatments.filter(t => t.insulin).forEach(t => {
        const hour = new Date(t.created_at).getHours();
        insulinByHour[hour] += t.insulin;
    });

    return {
        labels: Array.from({length: 24}, (_, i) => `${i}h`),
        values: insulinByHour
    };
}

function stdev(values) {
    const avg = values.reduce((a, b) => a + b) / values.length;
    return Math.sqrt(values.map(v => Math.pow(v - avg, 2)).reduce((a, b) => a + b) / values.length);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

// Chargement initial
loadData();
